# Fix Port 3001 Already in Use

If you see the error `EADDRINUSE: address already in use :::3001`, follow these steps:

## Option 1: Kill the Process Using Port 3001 (Windows)

1. Find the process using port 3001:
```powershell
netstat -ano | findstr :3001
```

2. Note the PID (Process ID) from the output

3. Kill the process:
```powershell
taskkill /PID <PID> /F
```

Replace `<PID>` with the actual process ID from step 1.

## Option 2: Use a Different Port

Create or update your `.env` file:
```env
PORT=3002
```

Then restart the server.

## Option 3: Find and Kill All Node Processes (Nuclear Option)

```powershell
taskkill /F /IM node.exe
```

⚠️ Warning: This will kill ALL Node.js processes running on your system.
