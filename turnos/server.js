const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración: máximo de personas por turno
const MAX_POR_TURNO = 3;

// MongoDB Atlas Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://agusaguirre053_db_user:C7qtdI66edyp0zWn@cluster0.ndrljhn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'turnos_clases';

let db;
let turnosCollection;

// Conectar a MongoDB
async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    turnosCollection = db.collection('turnos');
    console.log('✅ Conectado a MongoDB Atlas');
    
    // Crear índices para mejor rendimiento
    await turnosCollection.createIndex({ fecha: 1, hora: 1 });
    await turnosCollection.createIndex({ fecha: 1 });
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    process.exit(1);
  }
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// GET turnos ocupados de un mes (para marcar en calendario)
app.get('/api/turnos', async (req, res) => {
  try {
    const { year, month } = req.query;
    let query = {};
    if (year && month) {
      query.fecha = { $regex: `^${year}-${String(month).padStart(2,'0')}` };
    }
    const turnos = await turnosCollection.find(query).sort({ fecha: 1, hora: 1 }).toArray();
    
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
    const { fecha, nombre, modalidad } = req.query;
    if (!fecha) return res.status(400).json({ error: 'Falta fecha' });
    const turnosDia = await turnosCollection.find({ fecha }).toArray();
    
    // Agrupar turnos por hora
    const turnosPorHora = {};
    turnosDia.forEach(t => {
      if (!turnosPorHora[t.hora]) turnosPorHora[t.hora] = [];
      turnosPorHora[t.hora].push(t);
    });
    
    // Horarios cada 1 hora (14:00 a 18:00)
    const HORAS = ['14:00','15:00','16:00','17:00','18:00'];
    const nombreNorm = nombre ? nombre.trim().toLowerCase() : null;
    
    // Crear array con info detallada de cada hora
    const horasInfo = HORAS.map(hora => {
      const turnos = turnosPorHora[hora] || [];
      const ocupados = turnos.length;
      const lleno = ocupados >= MAX_POR_TURNO;
      
      // Verificar si la misma persona ya tiene turno en ese horario
      let bloqueadoPersona = false;
      if (nombreNorm) {
        bloqueadoPersona = turnos.some(t => t.nombre.trim().toLowerCase() === nombreNorm);
      }
      
      // Verificar si la modalidad es incompatible
      let bloqueadoModalidad = false;
      let modalidadExistente = null;
      if (modalidad && turnos.length > 0) {
        modalidadExistente = turnos[0].modalidad;
        if (modalidadExistente !== modalidad) {
          bloqueadoModalidad = true;
        }
      }
      
      const bloqueado = bloqueadoPersona || bloqueadoModalidad;
      let motivoBloqueo = null;
      if (bloqueadoPersona) motivoBloqueo = 'Ya tenés turno en este horario';
      else if (bloqueadoModalidad) motivoBloqueo = `Solo ${modalidadExistente} en este horario`;
      
      return {
        hora,
        ocupados,
        disponibles: MAX_POR_TURNO - ocupados,
        lleno,
        bloqueado,
        motivoBloqueo,
        modalidadExistente
      };
    });
    
    const disponibles = horasInfo.filter(h => !h.lleno && !h.bloqueado).map(h => h.hora);
    const ocupadosList = horasInfo.filter(h => h.lleno).map(h => h.hora);
    
    res.json({ fecha, disponibles, ocupados: ocupadosList, horasInfo, maxPorTurno: MAX_POR_TURNO });
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
    const turnosExistentes = await turnosCollection.find({ fecha, hora }).toArray();
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
    
    // Verificar que si ya hay turnos presenciales en ese horario, no se pueda agregar virtual y viceversa
    if (turnosExistentes.length > 0) {
      const modalidadExistente = turnosExistentes[0].modalidad;
      if (modalidadExistente !== modalidad) {
        return res.status(409).json({ error: `Ese horario ya tiene clases en modalidad ${modalidadExistente}. No se puede mezclar presencial y virtual en el mismo horario.` });
      }
    }
    
    // Verificar que sea lunes-viernes
    const d = new Date(fecha + 'T12:00:00');
    const dow = d.getDay();
    if (dow === 0 || dow === 6) {
      return res.status(400).json({ error: 'Solo se dictan clases de lunes a viernes' });
    }
    const turno = { nombre, materia, modalidad, fecha, hora, creadoEn: new Date().toISOString() };
    const result = await turnosCollection.insertOne(turno);
    turno._id = result.insertedId;
    res.json({ ok: true, turno });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE turno (admin)
app.delete('/api/turnos/:id', async (req, res) => {
  try {
    await turnosCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET admin - todos los turnos
app.get('/api/admin/turnos', async (req, res) => {
  try {
    const turnos = await turnosCollection.find({}).sort({ fecha: 1, hora: 1 }).toArray();
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
    
    const turnos = await turnosCollection.find({ fecha }).sort({ hora: 1 }).toArray();
    
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
    const turnos = await turnosCollection.find({}).toArray();
    let corregidos = 0;
    
    for (const t of turnos) {
      let nuevaMateria = t.materia;
      // Corregir materias con encoding malo
      if (t.materia.includes('�') || t.materia.includes('Ã')) {
        if (t.materia.includes('Matem')) nuevaMateria = 'Matemáticas';
        else if (t.materia.includes('Qu')) nuevaMateria = 'Química';
        else if (t.materia.includes('F')) nuevaMateria = 'Física';
        
        await turnosCollection.updateOne({ _id: t._id }, { $set: { materia: nuevaMateria } });
        corregidos++;
      }
    }
    
    res.json({ ok: true, corregidos });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Iniciar servidor después de conectar a la DB
connectDB().then(() => {
  app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
});
