const WebSocket = require('ws')
const axios = require('axios')
const { faceCompare, getAllFaces } = require('./lib')

const ws = new WebSocket.Server({ port: 8080 })
const request = axios.create()

ws.on('connection', (ws) => {
  ws.on('message', async message => {
    const data = JSON.parse(message)
    if (data.type === 1) {
      const { mid, rid } = data
      const { data: response } = await request.get(
        `http://localhost:8888/api/room/sign?mid=${mid}&rid=${rid}`
      )

      if (!data) {
        return
      }

      const list = response.data.list

      faceCompare(ws, list)

      getAllFaces().then(console.log)
    }
  })
})
