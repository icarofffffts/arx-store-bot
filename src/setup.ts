import * as ws from 'ws'
;(global as any).WebSocket = ws.WebSocket || ws
