fetch('http://localhost:3000/api/webhook/whatsapp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: "1234567890",
            type: "text",
            text: { body: "hi" }
          }]
        }
      }]
    }]
  })
})
.then(res => res.json())
.then(data => console.log("✅ SUCCESS! Server replied:", data))
.catch(err => console.error("❌ ERROR:", err));