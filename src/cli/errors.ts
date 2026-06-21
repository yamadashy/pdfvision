export function exitWithError(message: string): never {
  console.error(`Error: ${message}`);
  console.error('Run "pdfvision --help" for usage.');
  process.exit(1);
}
