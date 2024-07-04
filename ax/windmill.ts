export class WindmillHub {
  static async submitCode(code: string, tests: string): Promise<void> {
    console.log('Submitting to Windmill Hub:');
    console.log('Code:', code);
    console.log('Tests:', tests);
  }
}
