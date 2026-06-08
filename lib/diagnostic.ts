export function logDiagnostic(msg: string, data?: any) {
    const timestamp = new Date().toISOString();
    try {
        const safeData = data ? JSON.stringify(data, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value, 2) : '';
        console.log(`[${timestamp}] ${msg} ${safeData}`);
    } catch (e) {
        console.log(`[${timestamp}] ${msg} [Error stringifying metadata: ${e instanceof Error ? e.message : String(e)}]`);
    }
}
