// src/models/ListaDePedidos.js
import mongoose from "mongoose";

const PedidoItemSchema = new mongoose.Schema(
    {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
        category: { type: String, default: "" },
        // Info del producto al momento del pedido
        productSnapshot: {
            title: String,
            images: [String],
            description: String
        }
    },
    { _id: false }
);

const CustomerInfoSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        email: { type: String, required: true },
        phone: { type: String, required: true },
        address: { type: String, required: true },
        city: { type: String, default: "" },
        province: { type: String, default: "" },
        postalCode: { type: String, default: "" },
        specialInstructions: { type: String, default: "" }
    },
    { _id: false }
);

const PaymentInfoSchema = new mongoose.Schema(
    {
        method: { type: String, required: true },
        cardLast4: { type: String, default: "" },
        bankName: { type: String, default: "" },
        subtotal: { type: Number, required: true, min: 0 },
        shipping: { type: Number, default: 0 },
        total: { type: Number, required: true, min: 0 }
    },
    { _id: false }
);

const ShippingInfoSchema = new mongoose.Schema(
    {
        address: { type: String, required: true },
        method: { type: String, default: "Envío estándar" },
        estimatedDelivery: { type: String, default: "3-5 días hábiles" },
        cost: { type: Number, default: 0 },
        tracking: { type: String, default: "" },
        notes: { type: String, default: "" }
    },
    { _id: false }
);

const ListaDePedidosSchema = new mongoose.Schema(
    {
        // Referencia al pedido original de BuyerOrder
        buyerOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "BuyerOrder", required: true, index: true },
        buyerOrderCode: { type: String, required: true, index: true },

        // Info del vendedor
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

        // Info del cliente
        customer: { type: CustomerInfoSchema, required: true },

        // Solo los productos de este vendedor
        items: { type: [PedidoItemSchema], required: true, default: [] },

        // Totales específicos del vendedor
        vendorSubtotal: { type: Number, required: true, min: 0 },
        vendorTotal: { type: Number, required: true, min: 0 },

        // Info de pago (del pedido completo)
        payment: { type: PaymentInfoSchema, required: true },

        // Info de envío
        shipping: { type: ShippingInfoSchema, required: true },

        // Estado específico para este vendedor
        status: {
            type: String,
            enum: [
                "pendiente",      // Recién creado, esperando procesamiento
                "confirmado",     // Vendedor confirmó el pedido
                "en_proceso",     // Preparando productos
                "listo_envio",    // Productos listos para envío
                "enviado",        // Enviado por el vendedor
                "entregado",      // Confirmado como entregado
                "cancelado",      // Cancelado por vendedor o cliente
                "retraso"         // Con retraso en procesamiento
            ],
            default: "pendiente",
            index: true
        },

        // Info adicional de gestión
        priority: {
            type: String,
            enum: ["baja", "normal", "alta", "urgente"],
            default: "normal"
        },

        // Notas internas del vendedor
        vendorNotes: { type: String, default: "" },

        // Historial de cambios de estado
        statusHistory: [{
            status: String,
            timestamp: { type: Date, default: Date.now },
            notes: String,
            updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
        }],

        // Fechas importantes
        confirmedAt: Date,
        processedAt: Date,
        shippedAt: Date,
        deliveredAt: Date,
        cancelledAt: Date,

        // Info de seguimiento
        trackingNumber: { type: String, default: "" },
        trackingUrl: { type: String, default: "" },

        // Métricas de tiempo
        processingTime: Number, // minutos desde confirmación hasta envío
        deliveryTime: Number,   // días desde envío hasta entrega

        // Tags para organización
        tags: [{ type: String, trim: true }],

        // Info del pedido completo (para referencia)
        originalOrderTotal: { type: Number, required: true },
        otherVendorsInOrder: { type: Boolean, default: false },

        // Calificación del cliente (si aplica)
        customerRating: {
            rating: { type: Number, min: 1, max: 5 },
            comment: String,
            ratedAt: Date
        }
    },
    {
        timestamps: true,
        collection: "lista_de_pedidos"
    }
);

// Índices para optimizar consultas
ListaDePedidosSchema.index({ vendorId: 1, status: 1 });
ListaDePedidosSchema.index({ vendorId: 1, createdAt: -1 });
ListaDePedidosSchema.index({ vendorId: 1, priority: 1, status: 1 });
ListaDePedidosSchema.index({ buyerOrderCode: 1, vendorId: 1 });

// Middleware para actualizar fechas según el estado
ListaDePedidosSchema.pre("save", function (next) {
    const now = new Date();

    // Actualizar fechas según el estado
    if (this.isModified("status")) {
        switch (this.status) {
            case "confirmado":
                if (!this.confirmedAt) this.confirmedAt = now;
                break;
            case "en_proceso":
                if (!this.processedAt) this.processedAt = now;
                break;
            case "enviado":
                if (!this.shippedAt) this.shippedAt = now;
                // Calcular tiempo de procesamiento
                if (this.confirmedAt) {
                    this.processingTime = Math.round((now - this.confirmedAt) / (1000 * 60));
                }
                break;
            case "entregado":
                if (!this.deliveredAt) this.deliveredAt = now;
                // Calcular tiempo de entrega
                if (this.shippedAt) {
                    this.deliveryTime = Math.round((now - this.shippedAt) / (1000 * 60 * 60 * 24));
                }
                break;
            case "cancelado":
                if (!this.cancelledAt) this.cancelledAt = now;
                break;
        }

        // Agregar al historial de estado
        this.statusHistory.push({
            status: this.status,
            timestamp: now,
            notes: `Estado cambiado a ${this.status}`
        });
    }

    next();
});

// Método para obtener el tiempo transcurrido desde la creación
ListaDePedidosSchema.methods.getTimeElapsed = function () {
    const now = new Date();
    const diffMs = now - this.createdAt;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
        return `${diffDays} día${diffDays > 1 ? 's' : ''}`;
    } else {
        return `${diffHours} hora${diffHours !== 1 ? 's' : ''}`;
    }
};

// Método para obtener la prioridad visual
ListaDePedidosSchema.methods.getPriorityColor = function () {
    const colors = {
        baja: "#4caf50",
        normal: "#2196f3",
        alta: "#ff9800",
        urgente: "#f44336"
    };
    return colors[this.priority] || colors.normal;
};

export default mongoose.model("ListaDePedidos", ListaDePedidosSchema);