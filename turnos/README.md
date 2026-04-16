# 📚 Sistema de Turnos - Clases Particulares

Sistema web completo para gestionar turnos de clases particulares de **Matemáticas**, **Química** y **Física**.  
Incluye flyer publicitario, formulario de reserva con calendario interactivo, integración con WhatsApp y panel de administración protegido.

**URL en producción:** https://turnos-clases.onrender.com

---

## ✨ Funcionalidades

### 🎨 Flyer publicitario
- Diseño colorido estilo redes sociales
- Título con colores por materia (rosa, morado, cyan, naranja)
- Número de WhatsApp destacado con ícono
- Badges de "Clases Presenciales" y "Virtuales"
- Burbujas de testimonios de alumnos con degradados de colores
- Animaciones de destellos decorativos

### 📅 Sistema de reservas
- Formulario paso a paso (4 pasos con barra de progreso)
- Calendario interactivo que bloquea fines de semana y feriados argentinos 2025/2026
- Horarios disponibles en tiempo real (14:00 a 18:00 hs)
- Máximo 3 personas por turno/horario
- Al confirmar se abre WhatsApp con mensaje pre-armado

### 🔒 Validaciones
- **Mismo alumno, mismo horario:** No puede reservar dos veces el mismo día y hora
- **Modalidad incompatible:** Si un horario ya tiene turnos presenciales, no se puede reservar virtual (y viceversa), porque la profesora no puede estar en dos lugares al mismo tiempo
- **Horarios bloqueados** se muestran tachados con el motivo del bloqueo
- Solo se permiten reservas de lunes a viernes

### 👩‍💼 Panel de administración
- Acceso protegido con contraseña (con ojito para mostrar/ocultar)
- Listado completo de todos los turnos reservados
- Resumen de turnos por día específico
- Posibilidad de eliminar turnos individuales
- Exportar resumen del día
- Imprimir resumen

### 💬 Integración WhatsApp
- Al confirmar un turno, se abre WhatsApp con un mensaje pre-armado al número 2926-452797
- Incluye todos los datos del turno (nombre, materia, modalidad, fecha, horario)

---

## 🛠️ Tecnologías

| Componente | Tecnología |
|---|---|
| **Frontend** | HTML5, CSS3, JavaScript vanilla |
| **Backend** | Node.js + Express |
| **Base de datos** | MongoDB Atlas (nube) |
| **Fuentes** | Google Fonts (Nunito, Pacifico) |
| **Hosting** | Render.com |
| **Repositorio** | GitHub |

---

## 🗄️ Base de datos

El sistema usa **MongoDB Atlas** (base de datos en la nube), lo que garantiza que los turnos **nunca se pierden** aunque el servidor se reinicie o se redeploy.

### Colección `turnos`
```json
{
  "nombre": "Valentina García",
  "materia": "Matemáticas",
  "modalidad": "Presencial",
  "fecha": "2026-04-16",
  "hora": "15:00",
  "creadoEn": "2026-04-15T23:18:08.027Z"
}
```

---

## 🚀 Deploy en Render (producción)

El proyecto está configurado para deploy automático desde GitHub.

### Variables de entorno necesarias en Render:
| Variable | Descripción |
|---|---|
| `MONGO_URI` | Cadena de conexión a MongoDB Atlas |
| `PORT` | Puerto (Render lo asigna automáticamente) |

### Pasos:
1. Hacer push a `main` en GitHub
2. Render detecta el cambio y redeploy automáticamente
3. La variable `MONGO_URI` debe estar configurada en el dashboard de Render → Environment

---

## 💻 Correr localmente

```bash
# Instalar dependencias
npm install

# Iniciar servidor (conecta a MongoDB Atlas)
node server.js

# Abrir en el navegador
# http://localhost:3000
```

---

## 📁 Estructura del proyecto

```
turnos/
├── server.js          ← Backend (Express + MongoDB)
├── public/
│   └── index.html     ← Frontend completo (HTML + CSS + JS)
├── package.json       ← Dependencias (express, mongodb, cors, etc.)
├── package-lock.json
├── vercel.json        ← Config legacy de Vercel
├── .gitignore         ← Ignora node_modules y archivos locales
└── README.md          ← Este archivo
```

---

## 🔌 API Endpoints

### Públicos
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/turnos?year=2026&month=04` | Turnos de un mes (para el calendario) |
| `GET` | `/api/disponibilidad?fecha=2026-04-16&nombre=X&modalidad=Y` | Horarios disponibles de un día |
| `POST` | `/api/turnos` | Crear nuevo turno |

### Administración
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/admin/turnos` | Todos los turnos |
| `GET` | `/api/admin/resumen?fecha=2026-04-16` | Resumen de turnos de un día |
| `DELETE` | `/api/turnos/:id` | Eliminar un turno |
| `POST` | `/api/admin/fix-encoding` | Corregir encoding de materias |

---

## ⚙️ Configuración

### Cambiar número de WhatsApp
En `public/index.html` buscar `5492926452797` y reemplazar.  
Formato: código país (54) + código área sin 0 (292) + número (6452797).

### Cambiar contraseña del panel admin
En `public/index.html` buscar `ADMIN_PASSWORD` y cambiar el valor.

### Cambiar máximo de personas por turno
En `server.js` modificar la constante `MAX_POR_TURNO` (por defecto: 3).

### Cambiar horarios disponibles
En `server.js` modificar el array `HORAS` dentro del endpoint `/api/disponibilidad`.

---

## 📝 Licencia

Proyecto privado - Clases particulares de Agus Aguirre.  
Coronel Suárez, Buenos Aires, Argentina.
