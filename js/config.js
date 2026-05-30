const CONFIG = {
    // Physics
    SINGULARITY_R: 46, // event horizon radius (px)
    GM: 3800, // gravitational parameter - v_circ = sqrt(GM / R)
    GSOFT: 20, // softening radius - prevents infinite force at centre
    ATTRACTION_R: 100, // cursor influence radius (px)
    CURSOR_FORCE: 0.45, // max cursor acceleration (keep << BH gravity)
    PARTICLE_DAMPING: 0.9997, // per-frame speed factor (slow inspiral toward BH)

    // Particle system
    PARTICLE_COUNT: 35000, // starting tier - runtime adapts between 20k-100k
    PARTICLE_MIN_OFFSET: 28, // minDist = SINGULARITY_R + PARTICLE_MIN_OFFSET
    DISC_OUTER_R_FACTOR: 0.44, //outer_R = min(W,H) x this (spawn range & disc width)
    PARTICLE_ECC_MIN: 0.82, // orbit eccentricity range [min...min + spread]
    PARTICLE_ECC_SPREAD: 0.36,
    PARTICLE_LIFE_MIN: 300, // minimum particle lifetime (frames)
    PARTICLE_LIFE_MAX: 420, // added to PARTICLE_LIFE_MIN
    PARTICLE_NONZERO_CHANCE: 0.28, // probability of amber or dim-white type (rest = teal)

    // DISC RENDERING
    DISC_TILT: 0.28, // y-compression factor (~10 deg viewing angle above disc plane)
    DISC_IN_FACTOR: 1.8, // DISC_IN = SINGULARITY_R X DISC_IN_FACTOR

    // GRAVITATIONAL LENSING
    // LENS_R_FACTOR: 4.5, // lensing zone radiud = SINGULARITY_R X this
    // LENS_STRENGTH: 18, // deflection magnitude = SINGULARITY_R X this
    // LENS_DISC_FALLOFF: 2.8, // disc-plane blend falloff distance (in units of Rs)
    // PHOTON_RING_BRIGHT: 5.0, // brightness multiplier at photon ring (~2.6 Rs)

    // BACKGROUND MOTION BLUR
    MOTION_BLUR: 0.22, // per-frame bg fill alpha (higher = shorter particle trails)

    // Warp grid
    GRID_CELL_W: 55, // grid cell width (px)
    GRID_CELL_H: 45, // grid cell height (px)
    GRID_PULL_FRAC: 0.55, // pull radius = W x GRID_PULL_FRAC
    GRID_WARP_MAX: 55, //max pixel displacement toward BH centre

    // Data rain

    // Animation timing
    T_STEP: 10,   // time increment per frame
    PHYSICS_DT: 1, // physics timestep passed to updateParticles
};

// Derived constants
CONFIG.DISC_IN = CONFIG.SINGULARITY_R * CONFIG.DISC_IN_FACTOR;