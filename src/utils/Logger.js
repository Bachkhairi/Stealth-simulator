export class Logger {
  static log(message) {
    console.log(`[GridWorld ${new Date().toISOString()}] ${message}`);
  }
  static error(message) {
    console.error(`[GridWorld ${new Date().toISOString()}] ERROR: ${message}`);
  }
}
