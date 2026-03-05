// Launch electron.exe with the clean test directory
const { spawn } = require('child_process');
const path = require('path');

const electronExe = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
const testDir = 'd:\\tmp\\electron_test';

console.log('Launching:', electronExe, testDir);
const child = spawn(electronExe, [testDir], { stdio: 'inherit' });
child.on('close', (code) => {
    console.log('Exit code:', code);
    process.exit(code);
});
