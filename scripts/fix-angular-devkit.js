const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../node_modules/@angular-devkit/core/node/host.d.ts');

if (fs.existsSync(targetFile)) {
    let content = fs.readFileSync(targetFile, 'utf8');
    const brokenLine = '/// <reference types="@types/node/ts4.8/fs" />';

    if (content.includes(brokenLine)) {
        content = content.replace(brokenLine, '');
        fs.writeFileSync(targetFile, content);
        console.log('Successfully patched @angular-devkit/core/node/host.d.ts');
    } else {
        console.log('File already patched or broken line not found.');
    }
} else {
    console.log('Target file not found, skipping patch.');
}
