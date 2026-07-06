// escape - within ESCAPE_R: slingshot then aligned exit burst towatd cursor (never collide)
// orbit - cursor ring inside event horizon. smooth CW orbit around BH 
// normal - free drift, approach, land on cursor ring

(function () {
    'use strict';

    // canvas
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10000';
    document.body.appendChild(cv);

    const c = cv.getContext('2d');
    let W, H, DPR = 1;
    const resize = () =>{
        W = window.innerWidth; H = window.innerHeight;
        DPR = window.devicePixelRatio || 1;
        cv.width = W * DPR; cv.height = H * DPR;
        cv.style.width = W + 'px'; cv.style.height = H + 'px';
    };
    window.addEventListener('resize', resize);
    resize();

    const _S = Math.max(1, Math.hypot(W,H) / Math.hypot(1920, 1080));

    let mx = W/2, my = H/2;
    let px = mx, py = my, ppx = px, ppy = py;
    let rspd = 0;
    document.addEventListener('mousemove', e => {mx = e.clientX; my = e.clientY;});

    const RING_R = 27;
    const RH = 12;
    const RW = 4.5;
    const NOZZLE = RH * 0.5;
    const LAND_R = RING_R + NOZZLE + 1;
    const TAU = Math.PI * 2;

    const DIRTY_PAD  = 45;

    const G_K = 3.0 * _S;
    const G_SOFT = 27 * _S;
    const G_MAX = 0.08 * _S;
    const DRAG = 0.989;
    const MAX_V = 1.7 * _S;
    const MAX_V_LAND = 0.60;
    const RETRO = 0.038;
    const APPROACH_R = 82 * _S;
    const DETACH_SPD = 2.8 * _S;

    const BH_K = 3.5 * _S;
    const BH_SOFT = 50 * _S;

    const BH_FADE_IN = 120;

    const ESCAPE_R = 78;
    const ESCAPE_K = 30.0 * _S;
    const ESCAPE_EXIT = 300 * _S;
    const SLING_TANG = 0.11;
    const SLING_RAD = 0.28;
    const EXIT_TOL = 0.65;

    const ORBIT_R = 90;
    const ORBIT_TARGET_V = 1.20 * _S;
    const ORBIT_SPRING_K = 0.006;
    const ORBIT_TANG_GAIN = 0.12;

    const BH_ORBIT_CW = -1;

    const COL_BODY = 'rgba(232,226,212,0.90)';
    const COL_FIN = 'rgba(232,226,212,0.38)';
    const COL_TEAL_H = 'rgba(126,207,179,0.80)';
    const COL_TEAL_M = 'rgba(126,207,179,0.45)';
    const COL_TEAL_L = 'rgba(126,207,179,0.22)';
    const COL_AMB_H = 'rgba(200,133,58,0.70)';
    const COL_AMB_L = 'rgba(200,133,58,0.28)';
    const COL_TEAL_X = 'rgba(126,207,179,0.95)';
    const COL_AMB_X = 'rgba(200,133,58,0.90)';
    const COL_RED_X = 'rgba(196,57,28,0.55)';

    let rx = mx + 130, ry = my - 90;
    let vx = -0.3, vy = 0.15;
    let ang = 0;
    let phase = 'free';
    let landA = 0;
    let perchAge = 0;
    let cooldown = 0;
    let flameSmooth = 3.5;

    const noseToward = (nx, ny) => Math.atan2(nx, -ny);
    const engineToward = (nx, ny) => Math.atan2(-nx, ny);

    function lerpAng(a, b, t) {
        let d = b - a;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return a + d * (t < 0.85 ? t : 0.85);
    }

    function cwTang(bnx, bny) {
        return { tx: -bny * BH_ORBIT_CW, ty: bnx * BH_ORBIT_CW};
    }

    function draw(flameA, struggling, flen) {
        c.save();
        c.translate(rx, ry);
        c.rotate(ang);

        c.beginPath();
        c.moveTo(0, -RH);
        c.lineTo(RW, NOZZLE);
        c.lineTo(-RW, NOZZLE);
        c.closePath();
        c.strokeStyle = COL_BODY;
        c.lineWidth = 1.2;
        c.lineJoin = 'round';
        c.stroke();


        c.beginPath();
        c.moveTo(-RW, NOZZLE); c.lineTo(-RW - 3.2, NOZZLE + 4.5);
        c.moveTo(RW, NOZZLE); c.lineTo(RW + 3.2, NOZZLE + 4.5);
        c.strokeStyle = COL_FIN;
        c.lineWidth = 1.0;
        c.stroke();

        if (flameA > 0.02) {
            const fa = flameA < 1 ? flameA : 1;
            const hot = fa > 0.5;

            c.globalCompositeOperation = 'lighter';

            c.beginPath();
            c.moveTo(-1.5, NOZZLE);
            c.lineTo(0, NOZZLE + flen);
            c.lineTo(1.5, NOZZLE);
            c.fillStyle = struggling ? COL_TEAL_X : (hot ? COL_TEAL_H : COL_TEAL_L);
            c.fill();

            c.beginPath();
            c.arc(0, NOZZLE + flen * 0.22, flen * 0.38, 0, TAU);
            c.fillStyle = struggling ? COL_AMB_X: (hot ? COL_AMB_H : COL_AMB_L);
            c.fill();

            if (hot || struggling) {
                c.beginPath();
                c.moveTo(-0.8, NOZZLE);
                c.lineTo(0, NOZZLE + flen * 0.7);
                c.lineTo(0.8, NOZZLE);
                c.fillStyle = COL_TEAL_M;
                c.fill();

            }

            if (struggling) {
                c.beginPath();
                c.arc(0, NOZZLE + flen * 0.12, flen * 0.22, 0, TAU);
                c.fillStyle = COL_RED_X;
                c.fill();
            }
        }

        c.restore();
    }

    let pt = performance.now();

    function tick(ts) {
        requestAnimationFrame(tick);
        const dt = Math.min((ts - pt) / 16.667, 1.0);
        pt = ts;

        const prx = rx, pry = ry;

        ppx = px; ppy = py;
        px += (mx - px) * 0.1;
        py += (my - py) * 0.1;
        const rawRspd = Math.sqrt((px - ppx) * (px - ppx) + (py - ppy) * (py - ppy));
        rspd += (rawRspd - rspd) * 0.25;

        const ddx = px - rx, ddy = py - ry;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 0.001;
        const nx = ddx / dist, ny = ddy / dist;

        if (cooldown > 0) cooldown -= dt;
        const drag = 1 - (1 - DRAG) * dt;
        
        // bh influence
        let bhAcc = 0, bnx = 0, bny = 0, bhRatio = 0;
        let bhDist = 9999, bx = 0, by = 0;
        let cursInsideBH = false;
        const hasBH = typeof bhX === 'function';

        if (hasBH) {
            bx = bhX(); by = bhY();

            const bhVisibility = by <= 0 ? 0 : by < BH_FADE_IN ? by / BH_FADE_IN : 1;

            if (bhVisibility > 0) {
                const bdx = bx - rx, bdy = by - ry;
                bhDist = Math.sqrt(bdx * bdx + bdy * bdy) || 0.001;
                bnx = bdx / bhDist;
                bny = bdy / bhDist;

                const rawBhG = BH_K / (bhDist > BH_SOFT ? bhDist : BH_SOFT);
                const BH_G_MAX = 0.15;
                bhAcc = (rawBhG < BH_G_MAX ? rawBhG : BH_G_MAX) * bhVisibility;

                const curAcc = G_K / (dist > G_SOFT ? dist : G_SOFT);
                bhRatio = bhAcc / (curAcc < 0.001 ? 0.001 : curAcc);

                const singR = typeof CONFIG !== 'undefined' ? CONFIG.SINGULARITY_R : 46;
                const cbdx = bx - px, cbdy = by - py;
                cursInsideBH = (cbdx * cbdx + cbdy * cbdy) < singR * singR;

            } else {
                if (phase === 'escape' || phase === 'orbit') {phase = 'free'; cooldown = 20;}
            }
        }

        // state
        
        // escape
        if (hasBH && bhDist < ESCAPE_R && phase !== 'escape' && phase !== 'orbit') {
            if (phase === 'perch') {vx = -bnx * 0.6; vy = -bny * 0.6;}
            phase = 'escape';
        }

        // orbit
        if (hasBH && cursInsideBH && phase !== 'escape' && phase !== 'orbit') {
            if (phase === 'perch') {vx = Math.cos(landA) * 0.6; vy = Math.sin(landA) * 0.6;}

            const inward = vx * bnx + vy * bny;
            if (inward > 0) {vx -= bnx * inward; vy -= bny * inward;}
            phase = 'orbit';
        }

        if (phase === 'orbit' && !cursInsideBH) {phase = 'free'; cooldown = 20;}
        
        const struggling = bhRatio > 1.0 && phase !== 'orbit' && phase !== 'escape';
        let flameA = 0;

        // slingshot
        if (phase === 'escape') {
            const {tx, ty} = cwTang(bnx, bny);

            const rocketA = Math.atan2(ry - by, rx - bx);
            const cursorA = Math.atan2(py - by, px - bx);
            let angDiff = cursorA - rocketA;
            while (angDiff > Math.PI) angDiff -= Math.PI * 2;
            while (angDiff < -Math.PI) angDiff += Math.PI * 2;
            const aligned = Math.abs(angDiff) < EXIT_TOL;

            const ga = Math.min(G_K / (dist > G_SOFT ? dist : G_SOFT), G_MAX);
            const escThrust = ESCAPE_K / (bhDist > BH_SOFT ? bhDist : BH_SOFT);
            const netRadial = bhAcc - escThrust;

            if (aligned) {
                vx += (nx * ga + bnx * netRadial) * dt;
                vy += (ny * ga + bny * netRadial) * dt;
                ang = lerpAng(ang, engineToward(bnx, bny), 0.16 * dt);
                flameA = 0.90 + Math.random() * 0.10;
            } else {
                const partRadial = bhAcc - escThrust * SLING_RAD;
                vx += (tx * SLING_TANG + bnx * partRadial + nx * ga * 0.4) * dt;
                vy += (ty * SLING_TANG + bny * partRadial + ny * ga * 0.4) * dt;
                ang = lerpAng(ang, noseToward(tx, ty), 0.13 * dt);
                flameA = 0.60 + Math.random() * 0.20;
            }

            vx *= drag; vy *= drag;
            const spd = Math.sqrt(vx * vx + vy * vy);
            if (spd > MAX_V * 2.5) {const inv = MAX_V * 2.5 / spd; vx *= inv; vy *= inv;}
            rx += vx * dt; ry += vy * dt;

            if (bhDist > ESCAPE_EXIT) { 
                const dotVC = vx * nx + vy * ny;
                if (dotVC > 0 || bhDist > ESCAPE_EXIT * 1.8) {
                    phase = 'free'; cooldown = 20;
                }
            }
        
            // orbit
        } else if (phase === 'orbit') {
            const {tx, ty} = cwTang(bnx, bny);

            const radErr = bhDist - ORBIT_R;
            const radForce = radErr * ORBIT_SPRING_K - bhAcc;
            vx += bnx * radForce * dt;
            vy += bny * radForce * dt;

            const inward = vx * bnx + vy * bny;
            if (inward > 0) {vx -= bnx * inward * 0.18 * dt; vy -= bny * inward * 0.18 * dt;}

            const curTangV = vx * tx + vy * ty;
            const tangForce = (ORBIT_TARGET_V - curTangV) * ORBIT_TANG_GAIN;
            vx += tx * tangForce * dt;
            vy += ty * tangForce * dt;

            vx *= drag; vy *= drag;
            const spd = Math.sqrt(vx * vx + vy * vy);
            if (spd > MAX_V * 1.3) {const inv = MAX_V * 1.3 / spd; vx *= inv; vy *= inv;}
            rx += vx * dt; ry += vy * dt;

            if (spd > 0.06) ang = lerpAng(ang, noseToward(vx, vy), 0.15 * dt);
            flameA = 0.22 + Math.random() * 0.10;
            
            // perch
        } else if (phase === 'perch') {
            perchAge += dt;
            rx = px + Math.cos(landA) * LAND_R;
            ry = py + Math.sin(landA) * LAND_R;
            ang = engineToward(-Math.cos(landA), -Math.sin(landA));
            flameA = 0.20 + Math.random() * 0.10;

            if (perchAge > 0.5 && rspd > DETACH_SPD) {
                vx = 0; vy = 0;
                cooldown = 35; phase = 'free';
            }
            if (bhAcc > G_MAX * 0.90) {
                vx = -bnx * 0.8; vy = -bny * 0.8;
                phase = 'free'; cooldown = 15;
            }

            // approach
        } else if (phase === 'approach') {
            const spd = Math.sqrt(vx * vx + vy * vy);
            if (spd > 0.12) {
                vx -= (vx / spd)* RETRO * dt;
                vy -= (vy / spd) * RETRO * dt;
            }

            const ga = Math.min (G_K / (dist > G_SOFT ? dist : G_SOFT), G_MAX);
            vx += (nx * ga + bnx * bhAcc * 0.15) * dt;
            vy += (ny * ga + bny * bhAcc * 0.15) * dt;
            vx *= drag; vy *= drag;

            const spd2 = Math.sqrt(vx * vx + vy * vy);
            if (spd2 > MAX_V_LAND) { 
                const newSpd = MAX_V_LAND + (spd2 - MAX_V_LAND) * 0.82;
                vx *= newSpd / spd2; vy *= newSpd / spd2;
            }
            rx += vx * dt; ry += vy * dt;

            ang = lerpAng(ang, engineToward(nx, ny), 0.15 * dt);
            if (struggling) ang += (Math.random() - 0.5) * 0.03 * Math.min(bhRatio, 3);
            flameA = 0.70 + Math.random() * 0.25;

            if (dist <= LAND_R + 0.5) {
                landA = Math.atan2(ry - py, rx - px);
                rx = px + Math.cos(landA) * LAND_R; ry = py + Math.sin(landA) * LAND_R;
                vx = 0; vy = 0; perchAge = 0; phase = 'perch';
            }
            if (dist > APPROACH_R * 2.0) phase = 'free';

            // free
        } else {
            const curSpd = Math.sqrt(vx * vx + vy * vy);
            const rawGa = G_K / (dist > G_SOFT ? dist : G_SOFT);

            const speedRatio = Math.min(1, Math.max(0, (curSpd - MAX_V * 0.1) / (MAX_V * 0.4)));
            const minGa = G_MAX * 0.8 * speedRatio;
            const ga = Math.min(Math.max(rawGa, minGa), G_MAX * 2);
            vx += (nx * ga + bnx * bhAcc * 0.15) * dt;
            vy += (ny * ga + bny * bhAcc * 0.15) * dt;

            vx *= 0.9985; vy *= 0.9985;
            let spd = Math.sqrt(vx * vx + vy * vy);
            if (spd > MAX_V * 1.5) { const inv = MAX_V * 1.5 / spd; vx *= inv; vy *= inv; spd = MAX_V * 1.5;}

            if (dist < APPROACH_R * 2 && cooldown <= 0 && spd > MAX_V_LAND) {
                const t = 1-dist/ (APPROACH_R * 2);
                vx *= 1-t * 0.04;
                vy *= 1-t * 0.04;
            }
            rx += vx * dt; ry += vy * dt;

            const angRate = Math.min(0.22, 0.06 + (spd / MAX_V) * 0.14);
            if (spd > 0.06) ang = lerpAng(ang, noseToward(vx, vy), angRate * dt);
            if (dist < APPROACH_R && cooldown <= 0 ) phase = 'approach';
        }

        if (bhRatio > 0.3 && phase !== 'orbit' && phase !== 'escape') {
            flameA = Math.min(flameA + (bhRatio - 0.3) * 0.45, 1.0);
        }

        const rawFlen = (4 + Math.random() * 3.5) * Math.min(flameA, 1);
        flameSmooth += (rawFlen - flameSmooth) * 0.25;

        c.setTransform(DPR, 0,0,DPR,0,0);
        c.clearRect(prx - DIRTY_PAD, pry - DIRTY_PAD, DIRTY_PAD * 2, DIRTY_PAD * 2);
        draw(flameA, struggling, flameSmooth);
    }


    requestAnimationFrame(tick);
}());