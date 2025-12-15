const fs = require('fs');
const path = require('path');

const modulesDir = path.join(__dirname, 'public', 'modules');
const files = fs.readdirSync(modulesDir).filter(f => f.endsWith('.js') && !f.includes('-browser'));

files.forEach(file => {
  const content = fs.readFileSync(path.join(modulesDir, file), 'utf8');
  const moduleName = file.replace('.js', '');
  
  // Extract the function name and content
  const exportMatch = content.match(/export\s+function\s+(\w+)/);
  if (exportMatch) {
    const functionName = exportMatch[1];
    const browserVersion = `// ${moduleName} - Browser Compatible
defineModule('${moduleName}', function(module, exports) {
${content.replace(/export\s+function/, 'function')}
  
  // Return the function
  return ${functionName};
});`;
    
    fs.writeFileSync(
      path.join(modulesDir, `${moduleName}-browser.js`),
      browserVersion,
      'utf8'
    );
    console.log(`✅ Converted ${file}`);
  }
});