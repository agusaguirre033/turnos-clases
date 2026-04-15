# 📚 Sistema de Turnos - Clases Particulares

Sistema completo para agendar clases de Matemáticas, Química y Física.

## ✅ Funcionalidades
- Flyer estilo WhatsApp con testimonios de alumnos
- Calendario interactivo (bloquea fines de semana y feriados argentinos 2025/2026)
- Horarios disponibles en tiempo real (detecta turnos ya ocupados)
- Base de datos real (nedb - archivo .db local)
- Al confirmar → abre WhatsApp con mensaje pre-armado al 2926-452797
- Panel de administración para ver y borrar turnos

## 🚀 Cómo deployar en Vercel (gratis)

### Opción A - Vercel CLI (más fácil)
```bash
npm install -g vercel
cd turnos
vercel
```
Seguí los pasos y en 2 minutos tenés tu URL.

### Opción B - GitHub + Vercel web
1. Subí esta carpeta a un repo en github.com
2. Entrá a vercel.com → "Add New Project"
3. Conectá tu repo de GitHub
4. Click en "Deploy" → listo ✅

## 💻 Correr localmente
```bash
npm install
node server.js
# Abrí http://localhost:3000
```

## 📁 Estructura
```
turnos/
├── server.js        ← Backend (Express + nedb)
├── public/
│   └── index.html   ← Frontend completo
├── turnos.db        ← Base de datos (se crea sola)
├── package.json
├── vercel.json
└── README.md
```

## ⚙️ Cambiar número de WhatsApp
En `public/index.html` buscá `5492926452797` y reemplazá por tu número.
Formato: código país (54) + código área sin 0 (292) + número (6452797).
