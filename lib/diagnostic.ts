import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'dashboard_diagnostic.log');

export function logDiagnostic(msg: string, data?: any) {
    const timestamp = new Date().toISOString();
    let logMsg: string;

    try {
        // Handle BigInt and Circular structures safely
        const safeData = data ? JSON.stringify(data, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value, 2) : '';
        logMsg = `[${timestamp}] ${msg} ${safeData}\n`;
    } catch (e) {
        logMsg = `[${timestamp}] ${msg} [Error stringifying metadata: ${e instanceof Error ? e.message : String(e)}]\n`;
    }

    try {
        fs.appendFileSync(LOG_FILE, logMsg);
        console.log(`[Diagnostic] ${msg}`);
    } catch (e) {
        console.error('Failed to write diagnostic log:', e);
    }
}
