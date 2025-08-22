// src/services/pedidosSync.service.js
import mongoose from "mongoose";
import BuyerOrder from "../models/BuyerOrder.js";
import ListaDePedidos from "../models/ListaDePedidos.js";
import Product from "../models/Product.js";

export class PedidosSyncService {

    /**
     * Crea entradas en ListaDePedidos para cada vendedor en un BuyerOrder
     * @param {string} buyerOrderId - ID del pedido del comprador
     */
    static async syncBuyerOrderToVendors(buyerOrderId) {
        try {
            console.log('🔄 Sincronizando pedido a vendedores:', buyerOrderId);

            // Obtener el pedido del comprador
            const buyerOrder = await BuyerOrder.findById(buyerOrderId).lean();
            if (!buyerOrder) {
                throw new Error('BuyerOrder no encontrado');
            }

            // Agrupar items por vendedor
            const itemsByVendor = {};
            for (const item of buyerOrder.items) {
                if (!item.sellerId) continue;

                const vendorId = item.sellerId.toString();
                if (!itemsByVendor[vendorId]) {
                    itemsByVendor[vendorId] = [];
                }
                itemsByVendor[vendorId].push(item);
            }

            console.log('👥 Vendedores encontrados:', Object.keys(itemsByVendor).length);

            // Crear pedido para cada vendedor
            const createdOrders = [];
            for (const [vendorId, vendorItems] of Object.entries(itemsByVendor)) {
                try {
                    const vendorOrder = await this.createVendorOrder(buyerOrder, vendorId, vendorItems);
                    createdOrders.push(vendorOrder);
                    console.log('✅ Pedido creado para vendedor:', vendorId);
                } catch (error) {
                    console.error('❌ Error creando pedido para vendedor:', vendorId, error);
                }
            }

            console.log('🎉 Sincronización completada:', createdOrders.length, 'pedidos creados');
            return createdOrders;

        } catch (error) {
            console.error('💥 Error en sincronización:', error);
            throw error;
        }
    }

    /**
     * Crea un pedido específico para un vendedor
     */
    static async createVendorOrder(buyerOrder, vendorId, vendorItems) {

        // Calcular totales del vendedor
        let vendorSubtotal = 0;
        const enrichedItems = [];

        for (const item of vendorItems) {
            const itemTotal = item.price * item.quantity;
            vendorSubtotal += itemTotal;

            // Obtener info adicional del producto si está disponible
            let productSnapshot = {};
            try {
                const product = await Product.findById(item.productId).lean();
                if (product) {
                    productSnapshot = {
                        title: product.title,
                        images: product.images || [],
                        description: product.description || ""
                    };
                }
            } catch (err) {
                console.log('⚠️ No se pudo obtener info del producto:', item.productId);
            }

            enrichedItems.push({
                productId: item.productId,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                category: item.category || "",
                productSnapshot
            });
        }

        // Determinar si hay otros vendedores en el pedido
        const allVendors = [...new Set(buyerOrder.items.map(item => item.sellerId?.toString()).filter(Boolean))];
        const otherVendorsInOrder = allVendors.length > 1;

        // Calcular proporción del envío (si hay múltiples vendedores)
        const vendorShippingCost = otherVendorsInOrder
            ? Math.round((buyerOrder.shipping.cost * vendorSubtotal) / buyerOrder.total)
            : buyerOrder.shipping.cost;

        const vendorTotal = vendorSubtotal + vendorShippingCost;

        // Crear el pedido del vendedor
        const vendorOrderData = {
            buyerOrderId: buyerOrder._id,
            buyerOrderCode: buyerOrder.code,
            vendorId: new mongoose.Types.ObjectId(vendorId),

            customer: {
                name: buyerOrder.customer.fullName,
                email: buyerOrder.customer.email,
                phone: buyerOrder.customer.phone,
                address: buyerOrder.customer.address,
                city: buyerOrder.customer.city,
                province: buyerOrder.customer.province,
                postalCode: buyerOrder.customer.postalCode || "",
                specialInstructions: buyerOrder.customer.specialInstructions || ""
            },

            items: enrichedItems,
            vendorSubtotal,
            vendorTotal,

            payment: {
                method: buyerOrder.payment.method,
                cardLast4: buyerOrder.payment.cardLast4 || "",
                bankName: buyerOrder.payment.bankName || "",
                subtotal: vendorSubtotal,
                shipping: vendorShippingCost,
                total: vendorTotal
            },

            shipping: {
                address: buyerOrder.shipping.address,
                method: buyerOrder.shipping.method,
                estimatedDelivery: buyerOrder.shipping.estimatedDelivery,
                cost: vendorShippingCost,
                tracking: buyerOrder.shipping.tracking || "",
                notes: ""
            },

            status: "pendiente",
            priority: this.calculatePriority(vendorTotal, enrichedItems.length),

            originalOrderTotal: buyerOrder.total,
            otherVendorsInOrder,

            tags: this.generateTags(buyerOrder, enrichedItems)
        };

        // Verificar si ya existe un pedido para este vendedor y BuyerOrder
        const existingOrder = await ListaDePedidos.findOne({
            buyerOrderId: buyerOrder._id,
            vendorId: vendorId
        });

        if (existingOrder) {
            console.log('⚠️ Pedido ya existe para este vendedor:', vendorId);
            return existingOrder;
        }

        // Crear el nuevo pedido
        const vendorOrder = new ListaDePedidos(vendorOrderData);
        await vendorOrder.save();

        return vendorOrder;
    }

    /**
     * Calcula la prioridad basada en el valor y cantidad de items
     */
    static calculatePriority(total, itemCount) {
        if (total >= 500000) return "urgente";      // Más de ₡500,000
        if (total >= 100000) return "alta";        // Más de ₡100,000
        if (itemCount >= 5) return "alta";         // 5 o más productos
        if (total >= 50000) return "normal";       // Más de ₡50,000
        return "baja";
    }

    /**
     * Genera tags útiles para el pedido
     */
    static generateTags(buyerOrder, items) {
        const tags = [];

        // Tags por método de pago
        tags.push(`pago-${buyerOrder.payment.method}`);

        // Tags por cantidad de items
        if (items.length >= 5) tags.push("pedido-grande");
        if (items.length === 1) tags.push("item-unico");

        // Tags por categorías
        const categories = [...new Set(items.map(item => item.category).filter(Boolean))];
        categories.forEach(cat => tags.push(`cat-${cat}`));

        // Tags por valor
        const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        if (total >= 100000) tags.push("alto-valor");
        if (total <= 10000) tags.push("bajo-valor");

        // Tag por día de la semana (útil para análisis)
        const dayOfWeek = new Date().toLocaleDateString('es-ES', { weekday: 'long' });
        tags.push(`dia-${dayOfWeek}`);

        return tags;
    }

    /**
     * Actualiza el estado de un pedido en ListaDePedidos y sincroniza con BuyerOrder si es necesario
     */
    static async updateVendorOrderStatus(vendorOrderId, newStatus, notes = "", userId = null) {
        try {
            const vendorOrder = await ListaDePedidos.findById(vendorOrderId);
            if (!vendorOrder) {
                throw new Error('Pedido del vendedor no encontrado');
            }

            const oldStatus = vendorOrder.status;
            vendorOrder.status = newStatus;

            if (notes) {
                vendorOrder.vendorNotes = notes;
            }

            // Agregar al historial
            vendorOrder.statusHistory.push({
                status: newStatus,
                timestamp: new Date(),
                notes: notes || `Cambiado de ${oldStatus} a ${newStatus}`,
                updatedBy: userId ? new mongoose.Types.ObjectId(userId) : null
            });

            await vendorOrder.save();

            // Sincronizar con BuyerOrder si es necesario
            await this.syncVendorStatusToBuyerOrder(vendorOrder);

            console.log('✅ Estado actualizado:', vendorOrderId, oldStatus, '→', newStatus);
            return vendorOrder;

        } catch (error) {
            console.error('💥 Error actualizando estado:', error);
            throw error;
        }
    }

    /**
     * Sincroniza el estado del vendedor con el BuyerOrder general
     */
    static async syncVendorStatusToBuyerOrder(vendorOrder) {
        try {
            // Obtener todos los pedidos de vendedores para este BuyerOrder
            const allVendorOrders = await ListaDePedidos.find({
                buyerOrderId: vendorOrder.buyerOrderId
            }).lean();

            // Determinar el estado general basado en todos los vendedores
            const statusPriority = {
                "cancelado": 0,
                "pendiente": 1,
                "confirmado": 2,
                "en_proceso": 3,
                "listo_envio": 4,
                "enviado": 5,
                "entregado": 6
            };

            // El estado general es el mínimo (más atrasado) de todos los vendedores
            const generalStatus = allVendorOrders.reduce((minStatus, order) => {
                const currentPriority = statusPriority[order.status] || 1;
                const minPriority = statusPriority[minStatus] || 1;
                return currentPriority < minPriority ? order.status : minStatus;
            }, "entregado");

            // Actualizar BuyerOrder si es necesario
            const buyerOrder = await BuyerOrder.findById(vendorOrder.buyerOrderId);
            if (buyerOrder && buyerOrder.status !== generalStatus) {
                buyerOrder.status = generalStatus;
                await buyerOrder.save();
                console.log('🔄 BuyerOrder actualizado:', buyerOrder.code, '→', generalStatus);
            }

        } catch (error) {
            console.error('⚠️ Error sincronizando con BuyerOrder:', error);
            // No lanzar error para no interrumpir el flujo principal
        }
    }
}

export default PedidosSyncService;