function isEmptyObject (keys) {
    let key;
    for (key in keys) { return false; }
    return true;
}

// 物理定数
let CLAMP_VELOCITY = 0.00001;
let MAX_DELTA = 0.2;

AFRAME.registerComponent("button-wasd-controls", {
    schema: {
    acceleration: { default: 65 },
    adAxis: { default: "x", oneOf: ["x", "y", "z"] },
    adEnabled: { default: true },
    enabled: { default: true },
    fly: { default: false },
    wsAxis: { default: "z", oneOf: ["x", "y", "z"] },
    wsEnabled: { default: true },
    yAxis: {default: 'y', oneOf: ['x', 'y', 'z']},
    yEnabled: { default: true },
    yInverted: { default: false },
    key: { default: "w" },
    },

init: function () {
    // 変数定義
    this.buttons = {};
    this.easing = 1.1;
    this.velocity = new THREE.Vector3();



    // ボタンのIDと要素取得
    let BUTTON_IDS = this.BUTTON_IDS = ["leftBtn", "forwardBtn", "upBtn",  "downBtn", "rightBtn", "backBtn"];
    this.buttonEles= BUTTON_IDS.map(btnId => document.getElementById(btnId));

    // 関数をthisでbind
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.attachMouseEventListners = this.attachMouseEventListners.bind(this);

    // イベントリスナーを一括登録
    this.attachMouseEventListners()
},

tick: function (time, delta) {
    let data = this.data;
    let el = this.el;
    let velocity = this.velocity;

    // 速度が0で、かつ、キー入力もない場合は何もしない
    if (
        !velocity[data.adAxis] &&
        !velocity[data.wsAxis] &&
        !velocity[data.yAxis] &&
        isEmptyObject(this.buttons) 
    ) {
        return;
    }

    // 速度が0でない、もしくは、キー入力があった場合は速度を計算する。
    delta = delta / 1000;
    this.updateVelocity(delta);

    // 計算の結果、速度が0になったなら何もしない
    if (!velocity[data.adAxis] && !velocity[data.wsAxis] && !velocity[data.yAxis]) {
        return;
    }

    // 速度が0じゃない場合、速度に応じて座標を更新する
    el.object3D.position.add(this.getMovementVector(delta));
},        

updateVelocity: function (delta) {
    let acceleration;
    let adAxis;
    let adSign;
    let data = this.data;
    let buttons = this.buttons;
    let velocity = this.velocity;
    let MAX_DELTA = this.MAX_DELTA
    let wsAxis;
    let wsSign;
    let yAxis;

    adAxis = data.adAxis;
    wsAxis = data.wsAxis;
    yAxis = data.yAxis;

    // velocity["x"]がx軸方向=横の速度 velocity["z"]が奥行き方向の速度
    // FPSが低すぎる場合は速度を0にする
    if (delta > MAX_DELTA) {
        velocity[adAxis] = 0;
        velocity[wsAxis] = 0;
        velocity[yAxis] = 0;
        return;
    }

    // 減速の計算。速度が0でない場合、必ずここを通って減速処理する。定義したeasingの値によって減速具合が変わる
    let scaledEasing = Math.pow(1 / this.easing, delta * 60);
    if (velocity[adAxis] !== 0) {
        velocity[adAxis] = velocity[adAxis] * scaledEasing;
    }
    if (velocity[wsAxis] !== 0) {
        velocity[wsAxis] = velocity[wsAxis] * scaledEasing;
    }
    if (velocity[yAxis] !== 0) {
        velocity[yAxis] = velocity[yAxis] * scaledEasing;
    }

    // 減速の計算後、速度の絶対値がCLAMP_VELOCITYよりも小さいときは速度を0にして停止する
    if (Math.abs(velocity[adAxis]) < CLAMP_VELOCITY) {
        velocity[adAxis] = 0;
    }
    if (Math.abs(velocity[wsAxis]) < CLAMP_VELOCITY) {
        velocity[wsAxis] = 0;
    }
    if (Math.abs(velocity[yAxis]) < CLAMP_VELOCITY) {
        velocity[yAxis] = 0;
    }

    // schemeで定義したenabled がfalseに設定されている時は減速までで計算終了
    if (!data.enabled) {
        return;
    }

    // 押されたキーに応じて加速を計算する    
    acceleration = data.acceleration;   

    // 左右方向の速度を算出 加速度 × 時間変化
    if (data.adEnabled) {
        adSign = data.adInverted ? -1 : 1;
        if ( buttons.leftBtn ) {
          velocity[adAxis] -= adSign * acceleration * delta;
        }
        if ( buttons.rightBtn ) {
          velocity[adAxis] += adSign * acceleration * delta;
        }
    }

    // 奥行き方向の速度を算出 加速度 × 時間変化
    if (data.wsEnabled) {
        wsSign = data.wsInverted ? -1 : 1;
        if ( buttons.forwardBtn ) {
          velocity[wsAxis] -= wsSign * acceleration * delta;
        }
        if ( buttons.backBtn ) {
          velocity[wsAxis] += wsSign * acceleration * delta;
        }
    }

    if (data.wsEnabled) {
        wsSign = data.wsInverted ? -1 : 1;
        if ( buttons.downBtn ) {
          velocity[yAxis] -= wsSign * acceleration * delta;
        }
        if ( buttons.upBtn ) {
          velocity[yAxis] += wsSign * acceleration * delta;
        }
    }
},

getMovementVector: (function () {
    // wasd-controlsと全く一緒
    let directionVector = new THREE.Vector3(0, 0, 0);
    let rotationEuler = new THREE.Euler(0, 0, 0, "YXZ");

    return function (delta) {
        let rotation = this.el.getAttribute("rotation");
        let velocity = this.velocity;
        let xRotation;

        directionVector.copy(velocity);
        directionVector.multiplyScalar(delta);

        // Absolute.
        if (!rotation) {
        return directionVector;
        }

        xRotation = this.data.fly ? rotation.x : 0;

        // Transform direction relative to heading.
        rotationEuler.set(
        THREE.MathUtils.degToRad(xRotation),
        THREE.MathUtils.degToRad(rotation.y),
        0
        );
        directionVector.applyEuler(rotationEuler);
        return directionVector;
    };
})(),

// ボタンがクリックされ続けている間、そのボタンのフラグをtrueにする
onMouseDown: function (event) {
    let pushedBtn = event.srcElement.id;
    this.buttons[pushedBtn] = true;
},

// ボタンからクリックが離れたら、そのボタンのフラグをfalseにする
onMouseUp: function (event) {
    let releasedBtn = event.srcElement.id;
    delete this.buttons[releasedBtn];
},

// イベントリスナーをまとめて登録する
attachMouseEventListners: function () {
    let buttonEles = this.buttonEles;
    for (const buttonEle of buttonEles) {
        buttonEle.addEventListener("mousedown", this.onMouseDown);
        buttonEle.addEventListener("mouseup", this.onMouseUp);
    }
},

// イベントリスナーをまとめて削除する
removeMouseEventListeners: function () {
    let buttonEles = this.buttonEles;
    for (const buttonEle of buttonEles) {
        buttonEle.removeEventListener("mousedown", this.onMouseDown);
        buttonEle.removeEventListener("mouseup", this.onMouseUp);
    }
},

// 軸が変更された時、たとえば左右を表すad軸が変更された場合、古い方のad軸方向速度を0にする。
update: function (oldData) {
    // Reset velocity if axis have changed.
    if (oldData.adAxis !== this.data.adAxis) { this.velocity[oldData.adAxis] = 0; }
    if (oldData.wsAxis !== this.data.wsAxis) { this.velocity[oldData.wsAxis] = 0; }
    if (oldData.wsAxis !== this.data.yAxis) { this.velocity[oldData.yAxis] = 0; }
},
});