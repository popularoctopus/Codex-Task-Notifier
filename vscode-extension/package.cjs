'use strict';
// Portable ZIP/VSIX writer. Stored entries need no compression dependency.
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const manifest = require('./package.json');
const escape = value => String(value).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const entries = [];
function add(name, content) { entries.push([name, Buffer.from(content)]); }
function include(name) {
  const full = path.join(root, name);
  if (fs.statSync(full).isDirectory()) for (const child of fs.readdirSync(full).sort()) include(name + '/' + child);
  else add('extension/' + name, fs.readFileSync(full));
}
include('package.json');
for (const file of manifest.files) include(file);
add('extension.vsixmanifest', `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata>
<Identity Language="en-US" Id="${escape(manifest.name)}" Version="${escape(manifest.version)}" Publisher="${escape(manifest.publisher)}"/>
<DisplayName>${escape(manifest.displayName)}</DisplayName><Description xml:space="preserve">${escape(manifest.description)}</Description>
<Categories>Other</Categories><Tags>codex,tasks,notifications</Tags><GalleryFlags>Public</GalleryFlags>
<Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${escape(manifest.engines.vscode)}"/><Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/></Properties>
</Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Changelog" Path="extension/CHANGELOG.md" Addressable="true"/></Assets></PackageManifest>`);
add('[Content_Types].xml', `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${Object.entries({json:'application/json',js:'application/javascript',html:'text/html',md:'text/markdown',wav:'audio/wav',vsixmanifest:'text/xml'}).map(([ext,type]) => `<Default Extension="${ext}" ContentType="${type}"/>`).join('')}</Types>`);
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i=0;i<8;i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
let offset = 0;
const locals = [], directory = [];
for (const [name, bytes] of entries) {
  const filename = Buffer.from(name), crc = crc32(bytes);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20,4);
  local.writeUInt16LE(0x21,12); local.writeUInt32LE(crc,14);
  local.writeUInt32LE(bytes.length,18); local.writeUInt32LE(bytes.length,22); local.writeUInt16LE(filename.length,26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20,4); central.writeUInt16LE(20,6);
  central.writeUInt16LE(0x21,14); central.writeUInt32LE(crc,16);
  central.writeUInt32LE(bytes.length,20); central.writeUInt32LE(bytes.length,24);
  central.writeUInt16LE(filename.length,28); central.writeUInt32LE(offset,42);
  locals.push(local,filename,bytes); directory.push(central,filename);
  offset += local.length + filename.length + bytes.length;
}
const central = Buffer.concat(directory), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length,8); end.writeUInt16LE(entries.length,10);
end.writeUInt32LE(central.length,12); end.writeUInt32LE(offset,16);
const destination = path.join(root, `codex-task-notifier-${manifest.version}.vsix`);
fs.writeFileSync(destination, Buffer.concat([...locals,central,end]));
console.log(destination);
