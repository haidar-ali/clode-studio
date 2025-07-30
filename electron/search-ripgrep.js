import { spawn } from 'child_process';
import { relative } from 'path';
export async function searchWithRipgrep(rgPath, query, workingDir, options) {
    return new Promise((resolve, reject) => {
        const args = [query];
        if (!options.caseSensitive)
            args.push('-i');
        if (options.wholeWord)
            args.push('-w');
        if (!options.useRegex)
            args.push('-F');
        // Limits and ignore options
        args.push('--max-filesize', '5M');
        args.push('--no-follow');
        args.push('--max-count', '5'); // Max 5 matches per file
        args.push('-m', '2000'); // Stop after 2000 total matches
        args.push('--json');
        // Include hidden files but we'll exclude .git explicitly
        args.push('--hidden');
        // Include/exclude patterns
        if (options.includePattern) {
            args.push('-g', options.includePattern);
        }
        // Always exclude .git directory completely
        args.push('-g', '!.git');
        args.push('-g', '!.git/**');
        args.push('-g', '!**/.git');
        args.push('-g', '!**/.git/**');
        if (options.excludePattern) {
            const patterns = options.excludePattern.split(',').map(p => p.trim());
            patterns.forEach(p => {
                args.push('-g', `!${p}`);
            });
        }
        // Add the directory to search
        args.push(workingDir);
        const rg = spawn(rgPath, args);
        const results = new Map();
        let buffer = '';
        let errorOutput = '';
        rg.stdout.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer
            for (const line of lines) {
                if (!line.trim())
                    continue;
                try {
                    const json = JSON.parse(line);
                    if (json.type === 'match') {
                        const filePath = json.data.path.text;
                        const relativePath = relative(workingDir, filePath);
                        if (!results.has(filePath)) {
                            results.set(filePath, {
                                path: filePath,
                                relativePath: relativePath,
                                matches: []
                            });
                        }
                        const result = results.get(filePath);
                        if (result.matches.length < 100) { // Limit matches per file
                            result.matches.push({
                                line: json.data.line_number,
                                column: json.data.submatches[0].start,
                                text: json.data.lines.text,
                                length: json.data.submatches[0].end - json.data.submatches[0].start
                            });
                        }
                    }
                }
                catch (e) {
                    // Ignore parse errors
                }
            }
        });
        rg.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        rg.on('close', (code) => {
            if (code === 0 || code === 1) { // 0 = found matches, 1 = no matches
                resolve(Array.from(results.values()));
            }
            else {
                reject(new Error(`Ripgrep failed with code ${code}: ${errorOutput}`));
            }
        });
        rg.on('error', (err) => {
            reject(err);
        });
    });
}
