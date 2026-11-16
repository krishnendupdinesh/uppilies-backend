# Uppiliees E-Commerce Backend (Node.js + Express + TiDB + Cloudinary)

Complete REST API backend for the **Uppiliees** e-commerce platform, located in `c:/Users/USER/Desktop/ecom/backend` alongside the `shopclues` frontend folder. Built with plain CommonJS JavaScript (`Node.js` + `Express`), **TiDB Cloud** (MySQL-compatible with SSL), **Cloudinary** image storage (`multer` memory storage), and **JWT `httpOnly` cookie** authentication.

---

## Folder Structure

```text
ecom/
├── shopclues/              # Next.js Frontend
└── backend/                # Express Backend (this folder)
    ├── config/
    │   ├── cloudinary.js       # Cloudinary v2 SDK setup
    │   ├── db.js               # TiDB Cloud mysql2 connection pool (with TLS/SSL)
    │   ├── schema.sql          # SQL schema (users, categories, products, orders, order_items)
    │   ├── seedAdmin.js        # Seeds admin user from ADMIN_EMAIL & ADMIN_PASSWORD
    │   └── setupDb.js          # Runs schema.sql against TiDB Cloud
    ├── controllers/
    │   ├── adminController.js  # GET /api/admin/stats
    │   ├── authController.js   # Register, Login, Logout, GetMe
    │   ├── categoryController.js
    │   ├── orderController.js  # Guest + customer order creation, my orders, admin order management
    │   └── productController.js# Public product catalog + Admin CRUD with Cloudinary upload/cleanup
    ├── middleware/
    │   ├── authMiddleware.js   # requireAuth, optionalAuth, requireAdmin
    │   └── uploadMiddleware.js # Multer memoryStorage() configuration
    ├── routes/
    │   ├── adminRoutes.js
    │   ├── authRoutes.js
    │   ├── categoryRoutes.js
    │   ├── orderRoutes.js
    │   └── productRoutes.js
    ├── utils/
    │   ├── cloudinaryUpload.js # Upload buffer/base64 & delete by public_id on Cloudinary
    │   └── slugify.js          # URL-friendly slug helper
    ├── .env.example
    ├── package.json
    └── server.js               # Express entry point
```

---

## 1. Local Setup & Running Steps

### Step 1: Install Backend Dependencies

```bash
cd c:/Users/USER/Desktop/ecom/backend
npm install
```

### Step 2: Configure Environment Variables

Copy `.env.example` to `.env` inside `backend/`:

```bash
cp .env.example .env
```

Fill in your credentials in `backend/.env`:

```env
PORT=5000
FRONTEND_URL=http://localhost:3000
JWT_SECRET=your_super_secret_jwt_key_change_this

# TiDB Cloud Serverless (MySQL-compatible, requires SSL)
TIDB_HOST=gateway01.us-west-2.prod.aws.tidbcloud.com
TIDB_PORT=4000
TIDB_USER=your_tidb_user.root
TIDB_PASSWORD=your_tidb_password
TIDB_DATABASE=uppiliees

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Initial Admin Seed Credentials
ADMIN_EMAIL=admin@uppiliees.com
ADMIN_PASSWORD=AdminPassword123!
```

### Step 3: Create Database Tables & Seed Categories

Run the database setup script, which connects to TiDB over SSL, creates the database if needed, creates all 5 tables (`users`, `categories`, `products`, `orders`, `order_items`), and seeds the default categories (`herbal-beauty`, `traditional-food`, `handloom`):

```bash
npm run db:setup
```

### Step 4: Seed the Admin Account

Admin accounts cannot be created via public registration. Seed the admin user from `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`:

```bash
npm run seed:admin
```

### Step 5: Start the Backend Server

```bash
# Development mode (auto-restarts on changes)
npm run dev

# Or production mode
npm start
```

The backend API will run at `http://localhost:5000`. Check health at `http://localhost:5000/api/health`.

---

## 2. Connecting the Next.js Frontend (`ecom/shopclues`)

1. In `c:/Users/USER/Desktop/ecom/shopclues/.env`, set `NEXT_PUBLIC_API_URL`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

2. Run the Next.js development server from `c:/Users/USER/Desktop/ecom/shopclues`:

```bash
cd c:/Users/USER/Desktop/ecom/shopclues
npm install
npm run dev
```

3. Open `http://localhost:3000`. All frontend requests (`lib/api.ts` and `lib/admin/db.ts`) automatically call `NEXT_PUBLIC_API_URL` with `credentials: "include"`.

---

## 3. API Endpoints Reference

| Method | Route | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register customer account & set `httpOnly` JWT cookie |
| `POST` | `/api/auth/login` | Public | Login customer or admin & set `httpOnly` JWT cookie |
| `POST` | `/api/auth/logout` | Public | Clear `httpOnly` JWT cookie |
| `GET` | `/api/auth/me` | Auth | Return logged-in user (returns `401` when logged out) |
| `GET` | `/api/products` | Public | List products (optional `?category=herbal-beauty`) |
| `GET` | `/api/products/:slug` | Public | Get single product by slug (or numeric ID) |
| `POST` | `/api/products` | Admin | Create product (`multipart/form-data` with `image` file or JSON) |
| `PUT` | `/api/products/:id` | Admin | Update product; deletes old Cloudinary image when replaced |
| `DELETE` | `/api/products/:id` | Admin | Delete product & delete its image from Cloudinary |
| `POST` | `/api/orders` | Public / Auth | Place order as logged-in customer or guest (`name, email, phone, address`) |
| `GET` | `/api/orders/my` | Auth | Get logged-in customer's orders |
| `GET` | `/api/orders` | Admin | Get all orders (guest orders show customer as `"Guest"`) |
| `PATCH` | `/api/orders/:id/status` | Admin | Update order status (`Pending`, `Processing`, `Shipped`, `Delivered`, `Cancelled`) |
| `GET` | `/api/admin/stats` | Admin | Get `{ totalOrders, totalRevenue, productsCount }` |

---

## 4. Deployment Guide

### Deploying Backend (`ecom/backend` → Render / Railway)

1. Initialize Git inside `c:/Users/USER/Desktop/ecom/backend` and push it to a GitHub repository (e.g., `uppiliees-backend`):
   ```bash
   cd c:/Users/USER/Desktop/ecom/backend
   git init
   git add .
   git commit -m "Initial backend commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/uppiliees-backend.git
   git push -u origin main
   ```
2. Create a new **Web Service** on **Render** or **Railway** connected to `uppiliees-backend`:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
3. Add all environment variables from `backend/.env.example`:
   - Set `NODE_ENV=production`
   - Set `FRONTEND_URL=https://uppiliees-ecom.vercel.app` (enables cross-site `SameSite=None; Secure` cookies and CORS credentials).
4. Run `npm run db:setup` and `npm run seed:admin` against your TiDB Cloud database.

### Deploying Frontend (`ecom/shopclues` → Vercel)

1. Push `c:/Users/USER/Desktop/ecom/shopclues` to your `uppiliees-ecom` GitHub repository.
2. In **Vercel** → **Project Settings** → **Environment Variables**, set:
   - `NEXT_PUBLIC_API_URL=https://your-backend-service.onrender.com`
3. Redeploy on Vercel.
