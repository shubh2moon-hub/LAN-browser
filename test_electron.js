console.log('ELECTRON_RUN_AS_NODE:', process.env.ELECTRON_RUN_AS_NODE);
console.log('process.type:', process.type);
console.log('process.versions.electron:', process.versions.electron);

try {
    const electron = require('electron');
    console.log('Type of electron returned:', typeof electron);
} catch (e) {
    console.log('Error requiring electron:', e.message);
}

process.exit(0);
