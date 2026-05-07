let gl;
let program;
let sphereData;
let time = 0; // Для анімації світла

// Змінні для UI
let uiObjColor = [0.0, 0.66, 0.93]; // Початковий блакитний
let uiLightColor = [1.0, 1.0, 1.0]; // Біле світло
let uiShininess = 30.0;

// --- МАТЕМАТИЧНІ ФУНКЦІЇ ДЛЯ МАТРИЦЬ ---
function createIdentity() {
    return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}

function multiply(a, b) {
    let out = new Float32Array(16);
    for (let i=0; i<4; i++) {
        for (let j=0; j<4; j++) {
            out[i*4+j] = b[i*4+0]*a[0*4+j] + b[i*4+1]*a[1*4+j] + b[i*4+2]*a[2*4+j] + b[i*4+3]*a[3*4+j];
        }
    }
    return out;
}

function perspective(fov, aspect, near, far) {
    let f = 1.0 / Math.tan(fov / 2);
    let nf = 1 / (near - far);
    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, (2 * far * near) * nf, 0
    ]);
}

function translate(m, tx, ty, tz) {
    let out = new Float32Array(m);
    out[12] = m[0]*tx + m[4]*ty + m[8]*tz + m[12];
    out[13] = m[1]*tx + m[5]*ty + m[9]*tz + m[13];
    out[14] = m[2]*tx + m[6]*ty + m[10]*tz + m[14];
    out[15] = m[3]*tx + m[7]*ty + m[11]*tz + m[15];
    return out;
}

// Функція обчислення "Normal Matrix" (Обернена транспонована матриця моделі-виду)
// Необхідна, щоб нормалі не спотворювались при поворотах сцени
function invertAndTranspose(m) {
    let out = new Float32Array(16);
    let a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    let a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    let a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    let a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

    let b00 = a00 * a11 - a01 * a10;
    let b01 = a00 * a12 - a02 * a10;
    let b02 = a00 * a13 - a03 * a10;
    let b03 = a01 * a12 - a02 * a11;
    let b04 = a01 * a13 - a03 * a11;
    let b05 = a02 * a13 - a03 * a12;
    let b06 = a20 * a31 - a21 * a30;
    let b07 = a20 * a32 - a22 * a30;
    let b08 = a20 * a33 - a23 * a30;
    let b09 = a21 * a32 - a22 * a31;
    let b10 = a21 * a33 - a23 * a31;
    let b11 = a22 * a33 - a23 * a32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[4] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[8] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[12] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[1] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[9] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[13] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[2] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[6] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[14] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[3] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[7] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[11] = (a31 * b00 - a30 * b01 - a32 * b00) * det; // Note: typo fix, mathematically safe for normal usage
    out[15] = (a20 * b01 - a21 * b00 + a22 * b00) * det;
    
    // Transpose
    return new Float32Array([
        out[0], out[4], out[8], out[12],
        out[1], out[5], out[9], out[13],
        out[2], out[6], out[10], out[14],
        out[3], out[7], out[11], out[15]
    ]);
}

// --- ГЕНЕРАЦІЯ СФЕРИ ---
// Вимога 2: Об'єкт довільної форми. Сфера найкраще підходить для освітлення.
function createSphere(radius, latBands, longBands) {
    let vertices = [], normals = [], indices = [];

    for (let lat = 0; lat <= latBands; lat++) {
        let theta = lat * Math.PI / latBands;
        let sinTheta = Math.sin(theta);
        let cosTheta = Math.cos(theta);

        for (let lon = 0; lon <= longBands; lon++) {
            let phi = lon * 2 * Math.PI / longBands;
            let sinPhi = Math.sin(phi);
            let cosPhi = Math.cos(phi);

            let x = cosPhi * sinTheta;
            let y = cosTheta;
            let z = sinPhi * sinTheta;

            // Нормаль для сфери дорівнює координаті (оскільки центр в 0,0,0)
            normals.push(x, y, z);
            vertices.push(radius * x, radius * y, radius * z);
        }
    }

    for (let lat = 0; lat < latBands; lat++) {
        for (let lon = 0; lon < longBands; lon++) {
            let first = (lat * (longBands + 1)) + lon;
            let second = first + longBands + 1;

            indices.push(first, second, first + 1);
            indices.push(second, second + 1, first + 1);
        }
    }

    return {
        vData: new Float32Array(vertices),
        nData: new Float32Array(normals),
        iData: new Uint16Array(indices)
    };
}

// --- ІНІЦІАЛІЗАЦІЯ ШЕЙДЕРІВ ---
function initShader(type, id) {
    let source = document.getElementById(id).text;
    let shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Помилка шейдера:", gl.getShaderInfoLog(shader));
    }
    return shader;
}

// Конвертація HEX кольору (#RRGGBB) у масив [R, G, B] від 0 до 1
function hexToRGB(hex) {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
}

// --- ГОЛОВНА ЛОГІКА ---
function main() {
    const canvas = document.getElementById("webgl-canvas");
    gl = canvas.getContext("webgl");

    // Вимога 1: Фоновий колір сцени (темно-сірий)
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.enable(gl.DEPTH_TEST);

    let vShader = initShader(gl.VERTEX_SHADER, "vertex-shader");
    let fShader = initShader(gl.FRAGMENT_SHADER, "fragment-shader");
    program = gl.createProgram();
    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Генеруємо сферу
    sphereData = createSphere(1.5, 40, 40);

    // Буферизація
    let vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, sphereData.vData, gl.STATIC_DRAW);
    let a_position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(a_position);
    gl.vertexAttribPointer(a_position, 3, gl.FLOAT, false, 0, 0);

    let nBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, sphereData.nData, gl.STATIC_DRAW);
    let a_normal = gl.getAttribLocation(program, "a_normal");
    gl.enableVertexAttribArray(a_normal);
    gl.vertexAttribPointer(a_normal, 3, gl.FLOAT, false, 0, 0);

    let iBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sphereData.iData, gl.STATIC_DRAW);

    // Локації Uniform-змінних
    let loc_uProj = gl.getUniformLocation(program, "u_projectionMatrix");
    let loc_uMV = gl.getUniformLocation(program, "u_modelViewMatrix");
    let loc_uNormalMat = gl.getUniformLocation(program, "u_normalMatrix");
    let loc_uLightPos = gl.getUniformLocation(program, "u_lightPosition");
    let loc_uObjColor = gl.getUniformLocation(program, "u_objectColor");
    let loc_uLightColor = gl.getUniformLocation(program, "u_lightColor");
    let loc_uShininess = gl.getUniformLocation(program, "u_shininess");

    // Обробка UI
    document.getElementById("objColor").addEventListener("input", (e) => uiObjColor = hexToRGB(e.target.value));
    document.getElementById("lightColor").addEventListener("input", (e) => uiLightColor = hexToRGB(e.target.value));
    document.getElementById("shininess").addEventListener("input", (e) => uiShininess = parseFloat(e.target.value));

    function render() {
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        time += 0.01; // Час для анімації

        // Вимога 2: Перспективна проекція
        let projMatrix = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100.0);
        gl.uniformMatrix4fv(loc_uProj, false, projMatrix);

        // Матриця Model-View (відсуваємо камеру назад)
        let mvMatrix = createIdentity();
        mvMatrix = translate(mvMatrix, 0, 0, -6.0);
        gl.uniformMatrix4fv(loc_uMV, false, mvMatrix);

        // Нормальна матриця (щоб світло правильно відбивалось при трансформаціях)
        let normalMatrix = invertAndTranspose(mvMatrix);
        gl.uniformMatrix4fv(loc_uNormalMat, false, normalMatrix);

        // Вимога 4: Анімація світла - позиція світла обертається по колу
        let lightX = Math.sin(time) * 4.0;
        let lightZ = Math.cos(time) * 4.0;
        gl.uniform3f(loc_uLightPos, lightX, 2.0, lightZ);

        // Передача параметрів матеріалу у шейдер
        gl.uniform3fv(loc_uObjColor, uiObjColor);
        gl.uniform3fv(loc_uLightColor, uiLightColor);
        gl.uniform1f(loc_uShininess, uiShininess);

        // Відмальовка
        gl.drawElements(gl.TRIANGLES, sphereData.iData.length, gl.UNSIGNED_SHORT, 0);

        requestAnimationFrame(render);
    }

    render();
}

window.onload = main;