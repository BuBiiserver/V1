# SiteHub – ที่โฮสต์/แก้โค้ดเว็บผ่านเบราว์เซอร์
รัน: `npm install` แล้ว `node server.js` → เปิด http://localhost:3000
ล็อกอินด้วยอีเมล (magic link). ตั้งค่า SMTP ตาม .env.example เพื่อส่งอีเมลจริง
ข้อมูลเก็บที่ ./data (db.json + sites/<id>/...)
**ความปลอดภัย:** โค้ดผู้ใช้รันที่ origin เดียวกับแอป ตอนใช้งานจริงควรแยกโดเมนสำหรับ /s/ (เช่น *.usercontent.example.com)
