const express = require('express');
const cors = require('cors');
const path = require('path');
const Datastore = require('nedb-promises');

const app = express();
const PORT = process.env.PORT || 3000;

// DB
const db = Datastore.create({ filename: path.join(__dirname, 'turnos.db'), autoload: true });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET turnos ocupados de un mes
app.get('/api/turnos', async (req, res) => {
  try {
    const { year, month } = req.query;
    let query = {};
    if (year && month) {
      query.fecha = new RegExp(`^${year}-${String(month).padStart(2,'0')}`);
    }
    const turnos = await db.find(query).sort({ fecha: 1, hora: 1 });
    res.json(turnos);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET slots disponibles para una fecha
app.get('/api/disponibilidad', async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: 'Falta fecha' });
    const ocupados = await db.find({ fecha });
    const horasOcupadas = ocupados.map(t => t.hora);
    const HORAS = ['14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30'];
    const disponibles = HORAS.filter(h => !horasOcupadas.includes(h));
    res.json({ fecha, disponibles, ocupados: horasOcupadas });
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
    // Verificar que no esté ocupado
    const existe = await db.findOne({ fecha, hora });
    if (existe) {
      return res.status(409).json({ error: 'Ese horario ya está reservado' });
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

app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
