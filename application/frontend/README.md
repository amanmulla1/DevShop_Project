# DevShop Frontend

React + TypeScript frontend for the DevShop Cloud-Native DevOps Platform.

---

## Technology

| Concern | Tool |
|---------|------|
| Framework | React 18 |
| Language | TypeScript 5 |
| Build tool | Vite 5 |
| Styling | Plain CSS (CSS custom properties) |
| HTTP | Native `fetch` |
| State (cart) | React `useState` + `localStorage` |
| Testing | Vitest + React Testing Library |

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 18+ (22 recommended) |
| npm | 9+ |
| Spring Boot backend | Running on port 8080 |

---

## Environment Variables

Create a `.env.local` file in this directory (it is gitignored):

```bash
cp .env.example .env.local
```

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:8080` | Backend API base URL |

**Never commit `.env.local`.**

---

## Install Dependencies

```bash
cd application/frontend
npm install
```

---

## Run the Frontend (Development)

Make sure the Spring Boot backend is already running on port 8080, then:

```bash
npm run dev
```

Open: [http://localhost:5173](http://localhost:5173)

---

## Run Tests

```bash
npm test
```

Tests use mocked API calls — no backend required to run tests.

Expected result:
```
Tests  10 passed (10)
```

---

## Build for Production

```bash
npm run build
```

Output is in `dist/`. Serve it with any static file server.

---

## Ports

| Service | Port |
|---------|------|
| Frontend (Vite dev) | 5173 |
| Backend (Spring Boot) | 8080 |

---

## API Endpoints Used

The frontend calls these existing backend endpoints:

| Method | Path | Used for |
|--------|------|----------|
| `GET` | `/api/products` | Load product list |
| `GET` | `/api/products/{id}` | (Available, not currently called directly) |

---

## Features

- Product listing grid (fetched live from Spring Boot)
- Loading spinner while API call is in progress
- Error message + Retry button when the backend is unavailable
- Product detail modal (click any card)
- Shopping cart (Add, Remove, Increase, Decrease quantity)
- Cart item count badge in the navbar
- Subtotal calculation
- Out-of-stock enforcement (cannot exceed available stock)
- Cart persisted in `localStorage`
- Responsive layout (desktop / tablet / mobile)

---

## Project Structure

```
src/
├── api/
│   └── productApi.ts        # All backend fetch calls
├── components/
│   ├── CartDrawer.tsx        # Slide-out cart panel
│   ├── ErrorMessage.tsx      # Error state with retry
│   ├── Loading.tsx           # Spinner
│   ├── Navbar.tsx            # Top navigation + cart badge
│   ├── ProductCard.tsx       # Individual product card
│   ├── ProductGrid.tsx       # Responsive card grid
│   └── ProductModal.tsx      # Product detail modal
├── hooks/
│   └── useCart.ts            # Cart state + localStorage persistence
├── pages/
│   └── ProductsPage.tsx      # Main products page
├── styles/
│   └── global.css            # All styles (CSS custom properties)
├── test/
│   ├── App.test.tsx          # Integration tests
│   └── setup.ts              # Vitest + jest-dom setup
├── types/
│   └── Product.ts            # TypeScript interface matching backend entity
├── App.tsx                   # Root component
└── main.tsx                  # Entry point
```
