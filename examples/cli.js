import readline from 'readline';
import {
    PerplexityClient
} from '../src/index.js';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise(resolve => rl.question(prompt, resolve));
}

async function main() {
    console.log('Interactive Perplexity CLI (terminal)');

    const model = await question('Choose a mode (ex: auto, pro, reasoning, deep research) [auto]: ');
    const chosen = model.trim() || 'auto';

    // If pro/reasoning chosen, offer specific model choices
    let specificModel = null;
    if (['pro', 'reasoning'].includes(chosen)) {
        const {
            PerplexityClient
        } = await import('../src/index.js');
        const avail = PerplexityClient.getAvailableModels(chosen).filter(m => m != null);
        if (avail.length) {
            const pick = await question(`Available models for ${chosen}: ${avail.join(', ')} (press Enter for default): `);
            specificModel = pick.trim() || null;
            if (specificModel === '') specificModel = null;
        }
    }

    // Use cookies (recommended). If you already have `perplexity_cookies.json` (exported manually),
    // we auto-load it and pass to the client.
    let client;
    try {
        const fs = await import('fs');
        if (fs.existsSync('perplexity_cookies.json')) {
            const raw = fs.readFileSync('perplexity_cookies.json', 'utf8');
            const cookies = JSON.parse(raw);
            const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            client = new PerplexityClient({
                cookies: cookieHeader
            });
            console.log('Cookies loaded from perplexity_cookies.json');
        }
    } catch (e) {}

    if (!client) client = new PerplexityClient();

    console.log(`Chosen mode: ${chosen}. Start chatting. Type ":q" to quit.`);

    while (true) {
        const q = await question('> ');
        if (!q) continue;
        if (q.trim() === ':q') break;

        try {
            // On appelle search qui retourne la réponse finale
            const res = await client.search(q, {
                mode: chosen
            });
            console.log('Answer:');
            console.log(prettyResponse(res));
        } catch (err) {
            console.error('Request error:', err.message || err);
        }
    }

    rl.close();
}

// Pretty-print response: try to extract the best textual answer
function prettyResponse(res) {
    if (!res) return '[no response]';

    // 1) If there's a text array with FINAL content that contains answer in content.answer JSON string
    try {
        if (Array.isArray(res.text)) {
            // find FINAL step
            for (let i = res.text.length - 1; i >= 0; i--) {
                const t = res.text[i];
                if (t && (t.step_type === 'FINAL' || t.step_type === 'INITIAL_QUERY')) {
                    if (t.content && t.content.answer) {
                        try {
                            const parsed = JSON.parse(t.content.answer);
                            if (parsed.answer) return parsed.answer;
                        } catch (e) {
                            return t.content.answer;
                        }
                    }
                }
            }
        }
    } catch (e) {}

    // 2) fallback to blocks[].markdown_block.answer
    try {
        if (Array.isArray(res.blocks)) {
            for (const b of res.blocks) {
                if (b && b.markdown_block && b.markdown_block.answer) return b.markdown_block.answer;
            }
        }
    } catch (e) {}

    // 3) fallback: if res.text contains chunks, join them
    try {
        if (Array.isArray(res.text)) {
            const chunks = res.text.flatMap(t => {
                if (t && t.content && typeof t.content === 'object') {
                    if (t.content.answer) {
                        try {
                            return [JSON.parse(t.content.answer).answer];
                        } catch (e) {
                            return [t.content.answer];
                        }
                    }
                }
                return [];
            }).filter(Boolean);
            if (chunks.length) return chunks.join('\n');
        }
    } catch (e) {}

    // 4) last resort: pretty-print small JSON summary
    try {
        return JSON.stringify(res, ['query_str', 'text', 'blocks'], 2);
    } catch (e) {
        return String(res);
    }
}

main().catch(err => {
    console.error(err);
    process.exitCode = 1;
});