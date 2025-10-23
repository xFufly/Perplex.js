import {
    PerplexityClient
} from './src/index.js';

async function main() {
    console.log('Import and construction test for PerplexityClient');
    const c = new PerplexityClient();
    console.log('Client created:', typeof c.search === 'function' ? 'ok' : 'missing search');

    console.log('Example complete — to use your account, export browser cookies manually and place them in perplexity_cookies.json.');
}

main().catch(err => {
    console.error(err);
    process.exitCode = 1;
});