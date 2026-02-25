# Performance Backend Engine

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-blue.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-9.x-green.svg)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-5.x-red.svg)](https://redis.io/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.x-black.svg)](https://socket.io/)

A high-performance, real-time e-commerce backend designed to handle high-concurrency event windows (like Flash Sales) with sub-second latency and absolute data integrity.

## 🚀 Architectural Vision

This project isn't just a CRUD API; it's a **transactional engine**. Built with a "Performance-First" mindset, it utilizes **Express 5** for modern middleware handling and **TypeScript** for compile-time safety.

### Core Philosophy:

- **Atomic Integrity**: Preventing overselling in high-traffic windows through native database atomicity.
- **Real-time Sync**: Ensuring every user sees the same stock levels at the same millisecond.
- **Security-in-Depth**: Multi-layered defense including CSRF protection, rate limiting, and aggressive sanitization.

---

## 🛠️ Specialized Tech Stack

| Technology             | Role           | Rationale                                                                    |
| :--------------------- | :------------- | :--------------------------------------------------------------------------- |
| **Express 5**          | Core Framework | Leverages modern Node.js features and better error handling.                 |
| **MongoDB + Mongoose** | Data Store     | Chosen for flexible schema design and powerful aggregation/atomic operators. |
| **Redis + ioredis**    | Caching/State  | Powering real-time features and distributed locking.                         |
| **Socket.io**          | Real-time      | Critical for live stock updates and purchase feeds.                          |
| **BullMQ**             | Async Jobs     | Reliable background processing for expired purchase cleanup.                 |
| **Zod**                | Validation     | Schema-first type-safe validation for all ingestion points.                  |

---

## 💎 High-Value Implementation Details

### 1. Atomic Flash Sale Engine

The most critical part of the system is the `purchaseProduct` flow. To prevent "race conditions" where two users might buy the last available item simultaneously:

- I use Mongoose's `$inc` operator with a filter `stockRemaining: { $gt: 0 }`.
- This ensures the increment/decrement happens at the database level, making it **collision-proof**.
- Stock is automatically returned to the master record if a payment session expires.

### 2. Multi-Layered Security

The application implements a hardened security stack:

- **CSRF Protection**: Double-cookie submission pattern implemented via custom middleware.
- **HPP & XSS**: Protection against HTTP Parameter Pollution and Cross-Site Scripting.
- **Security Headers**: Aggressive `Helmet` configuration including local CSP and HSTS.
- **Rate Limiting**: Intelligent limiting to prevent DDoS during sale launches.

### 3. Real-time Synchronization

Using Socket.io namespaces and rooms, we broadcast stock updates ONLY to users currently viewing a specific sale, minimizing network overhead while maintaining perfect state synchronization across thousands of clients.

---

## 📁 Project Structure

```text
src/
├── common/         # Shared utilities, loggers, and base errors
├── config/         # Environment and service configurations
├── controller/     # Business logic orchestration
├── middleware/     # Security, auth, and validation layers
├── model/          # Mongoose schemas and entity models
├── routes/         # API endpoint definitions
├── services/       # Third-party integrations (Paystack, Resend)
└── server.ts       # Entry point & Socket.io initialization
```

---

## 🚦 Getting Started

### Prerequisites

- Node.js >= 20
- MongoDB Instance
- Redis Server

### Installation

```bash
npm install
```

### Environment Setup

Create a `.env` file based on the environment configuration in `src/config`.

### Running the App

```bash
# Development mode with hot-reload
npm run dev

# Build for production
npm run build

# Start production server
npm run start
```

---

## 👨‍💻 Developer Thought Process

During development, I prioritized **System Resilience**. For instance:

- **Transitive Dependency Management**: Recently identified and resolved an implicit dependency on the `cookie` package, promoting it to a direct dependency to ensure consistent type-safety across different Node environments.
- **Graceful Shutdowns**: Handlers for `SIGTERM` and `unhandledRejection` ensure that Redis and database connections are drained properly before the process exits.

---

_Created by [Boluwatife Olasunkanmi O.](https://github.com/your-profile)_
