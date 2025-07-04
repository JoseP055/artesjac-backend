# ArtesJAC Backend

This repository contains the backend API for ArtesJAC, a web-based marketplace for local handmade art and crafts. Built using Node.js, Express, and MongoDB, this backend provides all necessary services for user authentication, product management, and cart simulation.

---

## Project Overview

The backend is responsible for:

- User registration and login with role-based access (buyer/seller)
- CRUD operations for products
- Simulated shopping cart functionality (no real payment)
- Data validation and security controls
- Communication with a React frontend via RESTful API

---

## Technologies Used

- Node.js
- Express.js
- MongoDB (with Mongoose)
- JSON Web Tokens (JWT) for authentication
- Bcrypt for password hashing
- dotenv for environment variable management
- CORS for frontend-backend communication
- express-validator for input validation

---

## Prerequisites

Before running this project, make sure you have:

- Node.js and npm installed
- MongoDB instance running (local or Atlas)
- Git installed

---

## Installation and Setup

Clone the repository:

```bash
git clone https://github.com/JoseP055/artesjac-backend.git
cd artesjac-backend
