(function () {
    const canvas = document.getElementById('starfield');
    if (!canvas) return
    const ctx = canvas.getContext('2d');

    let W = 1, H = 1;
    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);

    // Star data
    const N = 220;
    const sx = new Float32Array(N);
    const sy = new Float32Array(N);
    const sr = new Float32Array(N);
    const sa = new Float32Array(N); // base alpha
    const sph = new Float32Array(N); // twinkle phase
    const ssp = new Float32Array(N); // twinkle speed
    const sfl = new Float32Array(N); // scintillation flare intensity
    const sft = new Float32Array(N); // frames until next flare attempt

    for (let i = 0; i < N; i++) {
        sx[i] = Math.random();
        sy[i] = Math.random();
        sph[i] = Math.random() * 2 * Math.PI;
        sft[i] = Math.random() * 400;

        if (i<150) {
            sr[i] = 0.25 + Math.random() * 0.55;
            sa[i] = 0.04 + Math.random() * 0.10;
            ssp[i] = 0.08 + Math.random() * 0.18; //dim stars twinkle faintly
        } else if (i < 205){
            sr[i] = 0.55 + Math.random() * 0.85;
            sa[i] = 0.13 + Math.random() * 0.20;
            ssp[i] = 0.25 + Math.random() * 0.65;
        } else {
            sr[i] = 1 + Math.random() * 1.2;
            sa[i] = 0.32 + Math.random() * 0.28;
            ssp[i] = 0.15 + Math.random() * 0.35;
        }
    }

    // Shooting stars
    const MAX_SHOOTERS = 4;
    const shooters = [];

    // angle range: roughly top left to bottom right or top right to bottom left
    function spawnShooter() {
        const fromRight = Math.random() < 0.5;
        // start from upper portion of screen
        const startX = fromRight
        ? 0.55+Math.random() * 0.55 // right side
        : Math.random() * 0.45; // left side
        const startY = Math.random() * 0.45; // upper 45% of screen

        // angle downward diagonal, slight variance
        const baseAngle = fromRight
        ? Math.PI * 0.75 + (Math.random() - 0.5) * 0.4 // 135 degrees +/- 22 degrees
        : Math.PI * 0.22 + (Math.random() - 0.5) * 0.4; // 40 degrees +/- 22 degrees

        const speed = 14 + Math.random() * 10; // pixels per frame
        const length = 120 + Math.random() * 160; // tail length px
        const alpha = 0.55 + Math.random() * 0.35;

        return {
            x: startX * W,
            y: startY * H,
            vx: Math.cos(baseAngle) * speed,
            vy: Math.sin(baseAngle) * speed,
            len: length,
            alpha,
            life: 1, // 1=fresh, counts down to 0
            decay: 0.018 + Math.random() * 0.012 // fade speed
        };
    }

    // Poisson-ish spawner: random interval between attempts
    let nextSpawn = 180 + Math.random() * 180; // frames until next spawn
    let frameCount = 0;

    function tickShooters() {
        frameCount++;

        // Maybe spawn
        if (frameCount >= nextSpawn && shooters.length < MAX_SHOOTERS) {
            shooters.push(spawnShooter());
            nextSpawn = frameCount + 300 + Math.random() * 360;
        }

        // update + draw
        for (let i = shooters.length - 1; i >= 0; i--) {
            const s = shooters[i];
            s.x += s.vx;
            s.y += s.vy;
            s.life -= s.decay;

            if (s.life <=0 || s.x < -200 || s.x > W + 200 || s.y > H + 200) {
                shooters.splice(i, 1);
                continue;
            }

            const a = s.life * s.alpha;

            // tail: gradient line from faded tip to bright head
            const tx = s.x - s.vx / Math.hypot(s.vx, s.vy) * s.len;
            const ty = s.y - s.vy / Math.hypot(s.vx, s.vy) * s.len;

            const grad = ctx.createLinearGradient(tx, ty, s.x, s.y);
            grad.addColorStop(0, `rgba(255,255,255,0)`);
            grad.addColorStop(0.6, `rgba(200,230,255,${a * 0.25})`);
            grad.addColorStop(1, `rgba(230,245,255,${a})`);

            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(s.x, s.y);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // bright head glow
            const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 6);
            grd.addColorStop(0, `rgba(255,255,255,${a})`);
            grd.addColorStop(0.4, `rgba(210,235,255,${a * 0.5})`);
            grd.addColorStop(1, `rgba(180,220,255,0)`);

            ctx.beginPath();
            ctx.arc(s.x, s.y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = grd;
            ctx.fill();
        }
    }

    // aurora
    function drawAurora() {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        const pulse = 0.50 + 0.50 * Math.sin(T * 0.35);

        const glowH = H * 0.44;
        const gg = ctx.createLinearGradient(0,0,0,glowH);
        gg.addColorStop(0, 'rgba(15, 190, 55, 0');
        gg.addColorStop(0.28, `rgba(15, 190, 55, ${(0.05 * pulse).toFixed(4)})`);
        gg.addColorStop(0.62, `rgba(15, 190, 55, ${(0.024 * pulse).toFixed(4)})`);
        gg.addColorStop(1, 'rgba(15, 190, 55, 0');

        ctx.fillStyle = gg;
        ctx.fillRect(0,0,W,glowH);

        const STRIP = 4;
        const n = Math.ceil(W/ STRIP);
        const cYBase = 0.21;
        const halfHBase = H * 0.19;

        for (let i = 0; i < n; i++) {
            const xN = i/n;
            const x = i * STRIP;

            const wave = Math.sin(xN * 3.1 + T * 0.15) * 0.028
                + Math.sin(xN * 7.2 + T * 0.24 + 1.52) * 0.013
                + Math.sin(xN * 1.8 + T * 0.08 + 3.10) * 0.021;
            const cY = (cYBase + wave) * H;

            const hMod = 0.72
                + 0.20 * Math.sin(xN * 3.4 + T * 0.11)
                + 0.08 * Math.sin(xN * 7.9 + T * 0.18 + 0.6);
            const halfH = halfHBase * Math.max(0.15, hMod);

            const fold = 0.62
                + 0.24 * Math.sin(xN * 2.5 + T * 0.13 + 0.4)
                + 0.14 * Math.sin(xN * 5.3 + T * 0.19 + 1.8);

            const env = Math.pow(Math.sin(xN * Math.PI), 0.45)
                * (0.72 + 0.28 * Math.sin(xN * 2.1 + T * 0.04));

            const a = 0.60 * pulse * env * fold;
            if (a < 0.005) continue;

            const g = ctx.createLinearGradient(x, cY - halfH, x, cY + halfH);
            g.addColorStop(0, `rgba(70, 15, 200, 0)`);
            g.addColorStop(0.12, `rgba(65, 25, 195, ${(a * 0.08).toFixed(3)})`);
            g.addColorStop(0.34, `rgba(25, 220, 75, ${(a * 0.45).toFixed(3)})`);
            g.addColorStop(0.58, `rgba(18, 250, 82, ${(a * 0.90).toFixed(3)})`);
            g.addColorStop(0.68, `rgba(18, 250, 82, ${(a * 1.00).toFixed(3)})`);
            g.addColorStop(0.80, `rgba(8, 220, 150, ${(a * 0.40).toFixed(3)})`);
            g.addColorStop(0.91, `rgba(0, 185, 210, ${(a * 0.10).toFixed(3)})`);
            g.addColorStop(1, `rgba(0, 165, 200, 0)`);

            ctx.fillStyle = g;
            ctx.fillRect(x, cY - halfH, STRIP, halfH * 2);
        }
        ctx.restore();
    }

    // DRAW LOOP
    let T = 0;

    function draw() {
        T += 0.006;

        ctx.fillStyle = '#04040a';
        ctx.fillRect(0, 0, W, H);

        drawAurora();

        // Stars - multi frequency twinkle
        for (let i = 0; i < N; i++) {
            let alpha = sa[i];
            const s = ssp[i], p = sph[i];

            if (i< 150) {
                // dim
                alpha *= 0.88 + 0.12 * Math.sin(T * s + p);
            } else if (i < 205) {
                // mid: three interfering frequencie for no repetition
                alpha *= 0.50
                  +0.28 * Math.sin(T * s + p)
                  +0.13 * Math.sin(T * s * 2.61 + p * 1.4)
                  +0.09 * Math.sin(T * s * 5.13 + p * 2.3);
            } else {
                // bright: chaotic multi sine + random scintillation flares
                alpha *= 0.42
                  +0.30 * Math.sin(T * s + p)
                  +0.16 * Math.sin(T * s * 2.83 + p * 1.7)
                  +0.12 * Math.sin(T * s * 4.97 + p * 0.9);

                if (sfl[i] > 0) {
                    alpha = Math.min(1, alpha + sfl[i] * 0.55);
                    sfl[i] = Math.max(0, sfl[i] - 0.022);
                } else if (sft[i] > 0) {
                    sft[i]--;
                } else if (Math.random() < 0.003) {
                    sfl[i] = 0.5 + Math.random() * 0.5;
                    sft[i] = 160 + Math.floor(Math.random() * 440);
                }
            }

            ctx.beginPath();
            ctx.arc(sx[i] * W, sy[i] * H, sr[i], 0, 2 * Math.PI);
            ctx.fillStyle = `rgba(255,255,255,${Math.max(0, Math.min(1, alpha))})`;
            ctx.fill();
        }

        tickShooters();
        requestAnimationFrame(draw);
    }

    resize();
    draw();
}());