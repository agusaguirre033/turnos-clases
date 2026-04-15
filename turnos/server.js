const express = require('express');
const cors = require('cors');
const path = require('path');
const Datastore = require('nedb-promises');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración: máximo de personas por turno (3 lugares por hora)
const MAX_POR_TURNO = 3;

// Horarios disponibles (1 hora cada turno)
const HORAS = ['14:00', '15:00', '16:00', '17:00'];

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
    
    // Calcular qué días están completamente llenos (todas las horas con 3 personas)
    const TOTAL_HORAS = HORAS.length;
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
    const { fecha, nombre } = req.query;
    if (!fecha) return res.status(400).json({ error: 'Falta fecha' });
    const turnosDia = await db.find({ fecha });
    
    // Normalizar nombre si se envía (para verificar si ya reservó en alguna hora)
    const nombreNorm = nombre ? nombre.toLowerCase().trim() : null;
    
    // Contar personas por hora y detectar modalidad
    const infoHoras = {};
    turnosDia.forEach(t => {
      if (!infoHoras[t.hora]) {
        infoHoras[t.hora] = { count: 0, modalidad: null, personas: [] };
      }
      infoHoras[t.hora].count++;
      infoHoras[t.hora].modalidad = t.modalidad; // La modalidad del horario
      infoHoras[t.hora].personas.push(t.nombre.toLowerCase().trim());
    });
    
    // Crear array con info detallada de cada hora
    const horasInfo = HORAS.map(hora => {
      const info = infoHoras[hora] || { count: 0, modalidad: null, personas: [] };
      return {
        hora,
        ocupados: info.count,
        disponibles: MAX_POR_TURNO - info.count,
        lleno: info.count >= MAX_POR_TURNO,
        modalidad: info.modalidad, // null si no hay reservas, 'Presencial' o 'Virtual' si hay
        personas: info.personas // Para validar que la persona no reserve dos veces en la misma hora
      };
    });
    
    // Compatibilidad: arrays simples para el frontend actual
    const disponibles = horasInfo.filter(h => !h.lleno).map(h => h.hora);
    const ocupados = horasInfo.filter(h => h.lleno).map(h => h.hora);
    
    res.json({ 
      fecha, 
      disponibles, 
      ocupados, 
      horasInfo, 
      maxPorTurno: MAX_POR_TURNO, 
      horas: HORAS
    });
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
    
    // Normalizar nombre para comparaciones
    const nombreNorm = nombre.toLowerCase().trim();
    
    // Validación 0: Nombre válido (mínimo 3 caracteres, solo letras y espacios)
    if (nombreNorm.length < 3) {
      return res.status(400).json({ error: 'El nombre debe tener al menos 3 caracteres' });
    }
    if (!/^[a-záéíóúñü\s]+$/i.test(nombreNorm)) {
      return res.status(400).json({ error: 'El nombre solo puede contener letras y espacios' });
    }
    
    // Verificar que sea lunes-viernes (antes de consultar la DB)
    const d = new Date(fecha + 'T12:00:00');
    const dow = d.getDay();
    if (dow === 0 || dow === 6) {
      return res.status(400).json({ error: 'Solo se dictan clases de lunes a viernes' });
    }
    
    // Obtener turnos existentes en esa fecha y hora
    const turnosExistentes = await db.find({ fecha, hora });
    
    // Validación 1: Verificar que no esté lleno (máximo 3 personas por turno)
    if (turnosExistentes.length >= MAX_POR_TURNO) {
      return res.status(409).json({ error: `Ese horario ya tiene ${MAX_POR_TURNO} personas registradas` });
    }
    
    // Validación 2: Verificar modalidad en la misma hora
    // Si ya hay reservas en esta hora, la modalidad debe ser la misma
    // (No se puede mezclar Presencial con Virtual en el mismo horario)
    if (turnosExistentes.length > 0) {
      const modalidadExistente = turnosExistentes[0].modalidad;
      if (modalidadExistente !== modalidad) {
        return res.status(409).json({ 
          error: `Este horario (${hora}) ya tiene una clase ${modalidadExistente}. No se puede mezclar Presencial con Virtual en el mismo horario.` 
        });
      }
    }
    
    // Validación 3: Verificar que la misma persona no tenga otra materia en la misma hora
    // (No puede tomar Física y Química a las 14:00, por ejemplo)
    const personaYaReservoMismaHora = turnosExistentes.some(t => 
      t.nombre.toLowerCase().trim() === nombreNorm
    );
    if (personaYaReservoMismaHora) {
      return res.status(409).json({ 
        error: `${nombre} ya tiene una reserva a las ${hora}. No podés tomar dos materias a la misma hora.` 
      });
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
