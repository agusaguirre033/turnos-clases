const express = require('express');
const cors = require('cors');
const path = require('path');
const Datastore = require('nedb-promises');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración: máximo de personas por turno
const MAX_POR_TURNO = 3;

// DB
const db = Datastore.create({ filename: path.join(__dirname, 'turnos.db'), autoload: true });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET turnos ocupados de un mes (para marcar en calendario)
app.get('/api/turnos', async (req, res) => {
  try {
    const { year, month } = req.query;
    let query = {};
    if (year && month) {
      query.fecha = new RegExp(`^${year}-${String(month).padStart(2,'0')}`);
    }
    const turnos = await db.find(query).sort({ fecha: 1, hora: 1 });
    
    // Calcular qué días están completamente llenos (todas las 8 horas con 3 personas = 24 turnos)
    const TOTAL_HORAS = 8;
    const turnosPorDia = {};
    turnos.forEach(t => {
      turnosPorDia[t.fecha] = (turnosPorDia[t.fecha] || 0) + 1;
    });
    
    const diasLlenos = Object.entries(turnosPorDia)
      .filter(([fecha, count]) => count >= TOTAL_HORAS * MAX_POR_TURNO)
      .map(([fecha]) => fecha);
    
    res.json({ turnos, diasLlenos, maxPorTurno: MAX_POR_TURNO });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET slots disponibles para una fecha
app.get('/api/disponibilidad', async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: 'Falta fecha' });
    const turnosDia = await db.find({ fecha });
    
    // Contar personas por hora
    const conteoHoras = {};
    turnosDia.forEach(t => {
      conteoHoras[t.hora] = (conteoHoras[t.hora] || 0) + 1;
    });
    
    const HORAS = ['14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30'];
    
    // Crear array con info detallada de cada hora
    const horasInfo = HORAS.map(hora => ({
      hora,
      ocupados: conteoHoras[hora] || 0,
      disponibles: MAX_POR_TURNO - (conteoHoras[hora] || 0),
      lleno: (conteoHoras[hora] || 0) >= MAX_POR_TURNO
    }));
    
    // Compatibilidad: arrays simples para el frontend actual
    const disponibles = horasInfo.filter(h => !h.lleno).map(h => h.hora);
    const ocupados = horasInfo.filter(h => h.lleno).map(h => h.hora);
    
    res.json({ fecha, disponibles, ocupados, horasInfo, maxPorTurno: MAX_POR_TURNO });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST nuevo turno
app.post('/api/turnos', async (req, res) => {
  try {
    const { nombre, materia, modalidad, fecha, hora } = req.body;
    if (!nombre || !materia || !modalidad || !fecha || !hora) {
      return res.status(400).json({ error: 'Faltan datos' });
    }
    // Verificar que no esté lleno (máximo 3 personas por turno)
    const turnosExistentes = await db.find({ fecha, hora });
    if (turnosExistentes.length >= MAX_POR_TURNO) {
      return res.status(409).json({ error: `Ese horario ya tiene ${MAX_POR_TURNO} personas registradas` });
    }
    // Verificar que sea lunes-viernes
    const d = new Date(fecha + 'T12:00:00');
    const dow = d.getDay();
    if (dow === 0 || dow === 6) {
      return res.status(400).json({ error: 'Solo se dictan clases de lunes a viernes' });
    }
    const turno = { nombre, materia, modalidad, fecha, hora, creadoEn: new Date().toISOString() };
    const nuevo = await db.insert(turno);
    res.json({ ok: true, turno: nuevo });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE turno (admin)
app.delete('/api/turnos/:id', async (req, res) => {
  try {
    await db.remove({ _id: req.params.id }, {});
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET admin - todos los turnos
app.get('/api/admin/turnos', async (req, res) => {
  try {
    const turnos = await db.find({}).sort({ fecha: 1, hora: 1 });
    res.json(turnos);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET admin - resumen de turnos por día
app.get('/api/admin/resumen', async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: 'Falta fecha' });
    
    const turnos = await db.find({ fecha }).sort({ hora: 1 });
    
    // Agrupar por hora
    const resumen = turnos.map(t => ({
      hora: t.hora,
      nombre: t.nombre,
      materia: t.materia,
      modalidad: t.modalidad,
      reservadoEl: t.creadoEn,
      id: t._id
    }));
    
    res.json({ fecha, turnos: resumen, total: turnos.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
