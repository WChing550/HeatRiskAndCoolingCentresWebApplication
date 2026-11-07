import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

export const MAX_CENTRE_PHOTOS = 10;
export const savedPhotos = row => [...new Set(row?.image_urls?.length ? row.image_urls : row?.image_url ? [row.image_url] : [])];
const bad = message => Object.assign(new Error(message), {status:400});

export function resolvePhotoOrder(raw, uploaded, previous = [], legacy = false) {
  if (raw == null) {
    const result = legacy && uploaded.length ? uploaded : [...previous, ...uploaded];
    if (result.length > MAX_CENTRE_PHOTOS) throw bad('A centre can have up to 10 photos.');
    return result;
  }
  let order;
  try { order = JSON.parse(raw); } catch { throw bad('Invalid photo order.'); }
  if (!Array.isArray(order) || order.length > MAX_CENTRE_PHOTOS) throw bad('A centre can have up to 10 photos.');
  const used = new Set(), newUsed = new Set();
  const photos = order.map(token => {
    if (typeof token !== 'string' || used.has(token)) throw bad('Invalid or duplicate photo reference.');
    used.add(token);
    if (token.startsWith('existing:')) {
      const url = token.slice(9);
      if (!previous.includes(url)) throw bad('A retained photo must already belong to this centre.');
      return url;
    }
    if (/^new:\d+$/.test(token)) {
      const index = Number(token.slice(4));
      if (!Number.isSafeInteger(index) || !uploaded[index] || newUsed.has(index)) throw bad('Invalid new photo reference.');
      newUsed.add(index); return uploaded[index];
    }
    throw bad('Invalid photo reference.');
  });
  if (newUsed.size !== uploaded.length) throw bad('Each uploaded photo must appear once in the gallery.');
  return photos;
}

export async function validateImage(file) {
  const handle = await fs.open(file.path, 'r');
  const bytes = Buffer.alloc(12);
  try { await handle.read(bytes,0,12,0); } finally { await handle.close(); }
  const png = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  const webp = bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP';
  if (!(file.mimetype==='image/png'&&png || file.mimetype==='image/jpeg'&&jpeg || file.mimetype==='image/webp'&&webp)) throw bad('The uploaded file is not a valid JPG, PNG or WebP image.');
}

export function registerCentrePhotoRoutes(app, {pool, auth, admin, ar, str, n, kl, logActivity, centreOut, diffFields, uploadDir}) {
  const extensions = {'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'};
  const upload = multer({
    storage:multer.diskStorage({destination:(_q,_f,cb)=>cb(null,uploadDir),filename:(_q,f,cb)=>cb(null,'centre-'+crypto.randomUUID()+(extensions[f.mimetype]||'.bin'))}),
    limits:{fileSize:5*1024*1024,files:MAX_CENTRE_PHOTOS,fields:30},
    fileFilter:(_q,f,cb)=>extensions[f.mimetype]?cb(null,true):cb(bad('Photos must be JPG, PNG or WebP.'))
  }).fields([{name:'images',maxCount:MAX_CENTRE_PHOTOS},{name:'image',maxCount:1}]);

  const save = editing => ar(async (q,s) => {
    const files = [...(q.files?.images||[]),...(q.files?.image||[])];
    let persisted = false;
    try {
      for (const file of files) await validateImage(file);
      const b=q.body;
      if (!str(b.name)||!str(b.address)||!str(b.operatingHours)) throw bad('Name, address and operating hours are required.');
      if (!kl(n(b.latitude),n(b.longitude))) throw bad('Coordinates must be within Kuala Lumpur (lat 3.00–3.30, lon 101.55–101.80).');
      if (!['open','temporarily_closed','maintenance','unavailable'].includes(b.status||'open')) throw bad('Invalid operational status.');
      const capacity=n(b.capacity);
      if (capacity!=null&&(!Number.isInteger(capacity)||capacity<0)) throw bad('Capacity must be a non-negative whole number.');
      let before=null;
      if (editing) {
        const r=await pool.query('SELECT * FROM cooling_centres WHERE id=$1',[q.params.id]);
        if (!r.rowCount) throw Object.assign(new Error('Centre not found.'),{status:404});
        before=r.rows[0];
      }
      const urls=resolvePhotoOrder(b.photoOrder,files.map(f=>'/uploads/'+f.filename),savedPhotos(before),Boolean(q.files?.image?.length));
      const values=[str(b.name),str(b.address),n(b.latitude),n(b.longitude),str(b.operatingHours),str(b.contact)||null,str(b.description)||null,str(b.facilities).split(',').map(x=>x.trim()).filter(Boolean),capacity,b.status||'open',urls[0]||null,urls];
      const result=editing
        ? await pool.query('UPDATE cooling_centres SET name=$1,address=$2,latitude=$3,longitude=$4,operating_hours=$5,contact=$6,description=$7,facilities=$8,capacity=$9,status=$10,image_url=$11,image_urls=$12,updated_at=NOW() WHERE id=$13 RETURNING *',[...values,q.params.id])
        : await pool.query("INSERT INTO cooling_centres(name,address,latitude,longitude,operating_hours,contact,description,facilities,capacity,status,image_url,image_urls,area,verified) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Kuala Lumpur',FALSE) RETURNING *",values);
      if (!result.rowCount) throw Object.assign(new Error('Centre not found.'),{status:404});
      persisted=true;
      const centre=result.rows[0];
      const changes=before?diffFields(before,centre,{name:'Name',address:'Address',latitude:'Latitude',longitude:'Longitude',operating_hours:'Operating hours',contact:'Contact',description:'Description',facilities:'Facilities',capacity:'Capacity',status:'Operational status',image_urls:'Photo gallery'}):null;
      await logActivity(q,{action:editing?'Updated cooling centre':'Added cooling centre',module:'Cooling Centres',recordType:'cooling_centre',recordId:centre.id,summary:(editing?'Updated':'Added')+` cooling centre "${centre.name}"`,details:editing?{changes}:null});
      s.status(editing?200:201).json(centreOut(centre));
    } finally {
      // Only newly uploaded temporary files are cleaned up on validation/DB failure.
      // Existing saved photos are never deleted here.
      if (!persisted) await Promise.all(files.map(f=>fs.unlink(f.path).catch(()=>{})));
    }
  });
  app.post('/api/admin/centres',auth,admin,upload,save(false));
  app.put('/api/admin/centres/:id',auth,admin,upload,save(true));
}
