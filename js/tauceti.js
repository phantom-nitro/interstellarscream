(function () {
    const canvas = document.getElementById('taucetiCanvas');
    if(!canvas) return;
    const sec = document.getElementById('tauceti');

    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    // if (!gl) { sec.style.display = 'none'; return; }
    if (!gl) {console.warn('[tauceti] WebGL unavailable - keeping static background'); return;}

    let W = 1, H = 1;
    function resize() {
        W = canvas.width = canvas.offsetWidth;
        H = canvas.height = canvas.offsetHeight;
        gl.viewport(0,0,W,H);
    }
    window.addEventListener('resize', resize);

    // Scroll progress
    let scrollProg = 0;
    function refreshScroll(){
        const r = sec.getBoundingClientRect();
        scrollProg = Math.max(0, Math.min(1,
            (window.innerHeight - r.top) / (r.height + window.innerHeight)
        ));
    }
    window.addEventListener('scroll', refreshScroll, {passive: true});

    // cursor tracking
    //position staus at last known location on leave
    // strength lerps to 0 so the swirl dissolves gracefully instead of cutting off
    let rawMX = 0.5, rawMY = 0.5;
    let smoothMX = 0.5, smoothMY = 0.5;
    let rawStr = 0, smoothStr = 0;

    sec.addEventListener('mouseenter', e => {
        const r = sec.getBoundingClientRect();
        smoothMX = rawMX = (e.clientX - r.left) /W;
        smoothMY = rawMY = 1- (e.clientY - r.top) / H;
        rawStr = 1;
    });
    sec.addEventListener('mousemove', e => {
        const r = sec.getBoundingClientRect();
        rawMX = (e.clientX - r.left) / W;
        rawMY = 1 - (e.clientY - r.top) / H;
        rawStr = 1;
    });
    sec.addEventListener('mouseleave', () => {rawStr = 0;});

    // vertex shader
    const VS = `
      attribute vec2 a_pos;
      void main() { gl_Position = vec4(a_pos, 0.0, 1.0);}
    `;

    // fragment shader
    const FS = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform vec2 u_res;
      uniform float u_time;
      uniform float u_scroll;
      uniform vec2 u_mouse;
      uniform float u_mouse_str;

      float hash(vec2 p){
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
        );
      }
      mat2 rot2(float a) {float c = cos(a), s=sin(a); return mat2(c,-s,s,c);}
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        mat2 m = rot2(0.8);
        for (int i = 0; i < 7; i++) {v += a * noise(p); p = m*p*2.1; a *= 0.48;}
        return v;
      }
      
      void main(){
        vec2 uv = gl_FragCoord.xy / u_res;
        float t = u_time * 0.055;
        
        // cursor influence (gaussian blob, radius ~0.32 uv units)
        vec2 mDiff = uv - u_mouse;
        float mInfl = exp(-dot(mDiff, mDiff) * 8.0) * u_mouse_str;

        // stretched coord with cursor swirl baked in before domain warp
        vec2 p = vec2(uv.x * 4.5 + t * 0.12, uv.y * 2.2);

        // rotate the local patch of p near the cursor (clouds stir)
        float swAng = mInfl * 0.9 * sin(t * 1.9);
        p += (rot2(swAng) * p - p) * mInfl * 0.55;

        // domain warp q
        vec2 q = vec2(
          fbm(p + vec2(0.00, t * 0.80)),
          fbm(p + vec2(5.20, 1.3 + t * 0.60))
        );
        // domain warp r
        vec2 r = vec2(
          fbm(p + 4.0 * q + vec2(1.7, 9.2 + t * 0.40)),
          fbm(p + 4.0 * q + vec2(8.3, 2.8 + t * 0.50))
        );

        float f = fbm(p + 3.5 * r);

        // horizontal banding
        float bandY = uv.y + (f - 0.5) * 0.42 + q.y * 0.16;
        float band = 0.5 + 0.5 * sin(bandY * 9.42 + r.x * 3.1 + t * 0.38);
        float v = clamp(mix(f, band, 0.52), 0.0, 1.0);

        // 5 stop deep green color ramp
        vec3 c0 = vec3(0.005, 0.016, 0.006);
        vec3 c1 = vec3(0.016, 0.050, 0.015);
        vec3 c2 = vec3(0.040, 0.135, 0.032);
        vec3 c3 = vec3(0.095, 0.320, 0.070);
        vec3 c4 = vec3(0.215, 0.580, 0.125);
        vec3 c5 = vec3(0.600, 0.960, 0.240);

        vec3 col;
        if (v<0.25) col = mix(c0, c1, v/0.25);
        else if (v < 0.50) col = mix(c1, c2, (v-0.25) / 0.25);
        else if (v < 0.72) col = mix(c2, c3, (v-0.50) / 0.22);
        else if (v < 0.88) col = mix(c3, c4, (v-0.72) / 0.16);
        else col = mix(c4, c5, (v-0.88) / 0.12);

        // aurora wisps
        vec2 ap1 = vec2(uv.x * 2.8 - t * 0.24, uv.y * 3.4 + t * 0.34);
        float au1 = pow(clamp((fbm(ap1 + q * 0.72 + r * 0.38) - 0.53) / 0.47, 0.0, 1.0), 2.0) * 1.9;

        vec2 ap2 = vec2(uv.x * 3.5 + t * 0.18, uv.y * 2.6 - t * 0.28);
        float au2 = pow(clamp((fbm(ap2 + r * 0.55) - 0.56) / 0.44, 0.0, 1.0), 2.5) * 1.5;

        float aurora = clamp(au1 + au2 * 0.6, 0.0 , 1.0);
        col = mix(col, vec3(0.62, 1.0, 0.28), aurora * 0.78 * (0.28 + u_scroll * 0.72));

        // vignette
        float vig = 1.0 - 0.52 * pow(length((uv - 0.5) * 2.0), 2.0);
        col *= clamp(vig, 0.0, 1.0);

        gl_FragColor = vec4(col, 1.0);
        
      }
          
      
    `;

  // compile and link
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[tauceti] shader compile failed:', gl.getShaderInfoLog(s));
    }
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('[tauceti] program link failed:', gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);

  // Full screen triangle strip
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER,
    new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uScroll = gl.getUniformLocation(prog, 'u_scroll');
  const uMouse = gl.getUniformLocation(prog, 'u_mouse');
  const uMouseStr = gl.getUniformLocation(prog, 'u_mouse_str');

// animation loop
    let TC = 0;
    let running = false;

    function draw(){
        TC += 0.016;
        smoothMX += (rawMX - smoothMX) * 0.07;
        smoothMY += (rawMY - smoothMY) * 0.07;
        smoothStr += (rawStr - smoothStr) * 0.04; //slow fade out ~1.5s
        gl.uniform2f(uRes, W, H);
        gl.uniform1f(uTime, TC);
        gl.uniform1f(uScroll, scrollProg);
        gl.uniform2f(uMouse, smoothMX, smoothMY);
        gl.uniform1f(uMouseStr, smoothStr);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0,4);
    }

    function tick() {
        if(!running) return;
        draw();
        requestAnimationFrame(tick);
    }

    new IntersectionObserver(entries => {
        running = entries[0].isIntersecting;
        if (running) tick();   
    }, {threshold: 0.01}).observe(sec);

    resize();
    refreshScroll();
}());