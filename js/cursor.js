const curEl = document.getElementById("cur");
const ringEl = document.getElementById("cur-ring");
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let ringX = mouseX;
let ringY = mouseY;

document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    curEl.style.left = mouseX + "px";
    curEl.style.top = mouseY + "px";
});

document.addEventListener('mousemove', e => {
    ringEl.style.left = e.clientX + 'px';
    ringEl.style.top = e.clientY + 'px';
});

function drawCursorField() {
    if (heroMY >= 1.0) return;
    const curX = heroMX * W, curY = heroMY * H;
    const cx = bhX(), cy = bhY();
    const dx = curX - cx, dy = curY - cy;
    if (Math.sqrt(dx*dx + dy*dy) < CONFIG.SINGULARITY_R * 1.5) return;

    ctx.save();

    const grad = ctx.createRadialGradient(curX, curY, 0, curX, curY, CONFIG.ATTRACTION_R);
    grad.addColorStop(0, `rgba(126,207,179,0.04)`);
    grad.addColorStop(0.7, `rgba(126,207,179,0.02)`);
    grad.addColorStop(1, `rgba(126,207,179,0)`);
    ctx.beginPath();
    ctx.arc(curX, curY, CONFIG.ATTRACTION_R, 0, 2 * Math.PI);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(curX, curY, CONFIG.ATTRACTION_R, 0, 2 * Math.PI);
    ctx.strokeStyle = `rgba(126,207,179,0.07)`;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
}