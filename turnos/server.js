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
app.use(express.json({ limit: '1mb' }));
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
    
    // Calcular qué días están completamente llenos (5 horas con 3 personas = 15 turnos)
    const TOTAL_HORAS = 5;
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
    
    // Horarios cada 1 hora (14:00 a 18:00)
    const HORAS = ['14:00','15:00','16:00','17:00','18:00'];
    
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

// Función para normalizar materias
function normalizarMateria(materia) {
  const m = materia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (m.includes('matem')) return 'Matemáticas';
  if (m.includes('quim')) return 'Química';
  if (m.includes('fis')) return 'Física';
  return materia;
}

// POST nuevo turno
app.post('/api/turnos', async (req, res) => {
  try {
    let { nombre, materia, modalidad, fecha, hora } = req.body;
    if (!nombre || !materia || !modalidad || !fecha || !hora) {
      return res.status(400).json({ error: 'Faltan datos' });
    }
    
    // Normalizar materia para evitar problemas de encoding
    materia = normalizarMateria(materia);
    
    // Verificar que no esté lleno (máximo 3 personas por turno)
    const turnosExistentes = await db.find({ fecha, hora });
    if (turnosExistentes.length >= MAX_POR_TURNO) {
      return res.status(409).json({ error: `Ese horario ya tiene ${MAX_POR_TURNO} personas registradas` });
    }
    
    // Verificar que el mismo chico no tenga otro turno en la misma fecha+hora
    const nombreNormalizado = nombre.trim().toLowerCase();
    const turnoMismoChico = turnosExistentes.find(t => 
      t.nombre.trim().toLowerCase() === nombreNormalizado
    );
    if (turnoMismoChico) {
      return res.status(409).json({ error: `Ya tenés un turno reservado a las ${hora} ese día` });
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

// POST admin - corregir encoding de materias
app.post('/api/admin/fix-encoding', async (req, res) => {
  try {
    const turnos = await db.find({});
    let corregidos = 0;
    
    for (const t of turnos) {
      let nuevaMateria = t.materia;
      // Corregir materias con encoding malo
      if (t.materia.includes('�') || t.materia.includes('Ã')) {
        if (t.materia.includes('Matem')) nuevaMateria = 'Matemáticas';
        else if (t.materia.includes('Qu')) nuevaMateria = 'Química';
        else if (t.materia.includes('F')) nuevaMateria = 'Física';
        
        await db.update({ _id: t._id }, { $set: { materia: nuevaMateria } });
        corregidos++;
      }
    }
    
    res.json({ ok: true, corregidos });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
