import ts from 'typescript';
import { fileURLToPath } from 'node:url';

if (ts.version !== '5.9.3') {
  throw new Error(`TypeScript 5.9.3 required; found ${ts.version}. No automatic installation.`);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const config = ts.readConfigFile(fileURLToPath(new URL('../tsconfig.json', import.meta.url)), ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: name => name,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  }));
}
const emitted = program.emit();
if (emitted.emitSkipped || emitted.diagnostics.length) throw new Error('TypeScript emit failed');
