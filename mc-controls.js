
const KEYCODE_TO_CODE = {
    '38': 'ArrowUp',
    '37': 'ArrowLeft',
    '40': 'ArrowDown',
    '39': 'ArrowRight',
    '87': 'KeyW',
    '65': 'KeyA',
    '83': 'KeyS',
    '68': 'KeyD',
    '32': 'Space',
    '16': 'ShiftLeft',
  }

const degToRad = deg => deg / 180 * Math.PI;

function bind (fn, ctx) {
  return (function (prependedArgs) {
    return function bound () {
      let args = prependedArgs.concat(Array.prototype.slice.call(arguments, 0));
      return fn.apply(ctx, args);
    };
  })(Array.prototype.slice.call(arguments, 2));
};

const shouldCaptureKeyEvent = function (event) {
  if (event.metaKey) { return false; }
  return document.activeElement === document.body;
};

let CLAMP_VELOCITY = 0.00001;
let MAX_DELTA = 0.2;
let KEYS = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown',
  'Space', 'ShiftLeft',
];

AFRAME.registerComponent("mc-controls", {
  schema: {
    acceleration: { default: 65 },
    adAxis: {default: 'x', oneOf: ['x', 'y', 'z']},
    adEnabled: {default: true},
    adInverted: {default: false},
    enabled: {default: true},
    fly: { default: false },
    wsAxis: {default: 'z', oneOf: ['x', 'y', 'z']},
    wsEnabled: {default: true},
    wsInverted: {default: false},
    yAxis: {default: 'y', oneOf: ['x', 'y', 'z']},
    yEnabled: { default: true },
    yInverted: { default: false },
    roleEnabled: { default: true },
    roleInverted: { default: false },
  },

  init: function () {
    this.buttons = {};
    this.keys = {};
    this.easing = 1.1;

    this.velocity = new THREE.Vector3();
    this.rotationx = 0;

    // ボタンのIDと要素取得
    let BUTTON_IDS = this.BUTTON_IDS = ["leftBtn", "forwardBtn", "upBtn",  "downBtn", "rightBtn", "backBtn"];
    this.buttonEles= BUTTON_IDS.map(btnId => document.getElementById(btnId));

    // 関数をthisでbind
    this.onBlur = bind(this.onBlur, this);
    this.onContextMenu = bind(this.onContextMenu, this);
    this.onFocus = bind(this.onFocus, this);
    this.onKeyDown = bind(this.onKeyDown, this);
    this.onKeyUp = bind(this.onKeyUp, this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);

    this.onVisibilityChange = bind(this.onVisibilityChange, this);
    this.attachVisibilityEventListeners();
  },

  tick: function (time, delta) {
    let data = this.data;
    let el = this.el;
    let velocity = this.velocity;

    // 速度が0で、かつ、キー入力もない場合は何もしない
    const nochg = !velocity[data.adAxis] && !velocity[data.wsAxis] && !velocity[data.yAxis] && !this.rotationx;
    if (nochg && isEmptyObject(this.keys) && isEmptyObject(this.buttons)) {
      return;
    }
    
    // 速度が0でない、もしくは、キー入力があった場合は速度を計算する。
    delta = delta / 1000;
    this.updateVelocity(delta);

    // 計算の結果、速度が0になったなら何もしない
    if (nochg) {
      return;
    }

    // 速度が0じゃない場合、速度に応じて座標を更新する
    el.object3D.rotation.y -= this.rotationx / 200;
    el.object3D.position.add(this.getMovementVector(delta));
  },

  remove: function () {
    this.removeKeyEventListeners();
    this.removeVisibilityEventListeners();
    this.removeButtonEventListeners();
  },

  play: function () {
    this.attachKeyEventListeners();
    this.attachButtonEventListners();
  },

  pause: function () {
    this.keys = {};
    this.removeKeyEventListeners();
    this.removeButtonEventListeners();
  },

  updateVelocity: function (delta) {
    let acceleration;
    let adAxis;
    let adSign;
    let data = this.data;
    let buttons = this.buttons;
    let keys = this.keys;
    let velocity = this.velocity;
    let wsAxis;
    let wsSign;

    adAxis = data.adAxis;
    wsAxis = data.wsAxis;
    const yAxis = data.yAxis;
    const role = data.role;

    // velocity["x"]がx軸方向=横の速度 velocity["z"]が奥行き方向の速度 velocity["y"]が縦方向の速度
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
    if (Math.abs(velocity[adAxis]) < CLAMP_VELOCITY) { velocity[adAxis] = 0; }
    if (Math.abs(velocity[wsAxis]) < CLAMP_VELOCITY) { velocity[wsAxis] = 0; }
    if (Math.abs(velocity[yAxis]) < CLAMP_VELOCITY) { velocity[yAxis] = 0; }
    
    // schemeで定義したenabled がfalseに設定されている時は減速までで計算終了
    if (!data.enabled) { return; }

    // 押されたキーに応じて加速を計算する  
    acceleration = data.acceleration;

    // 左右方向の速度を算出 加速度 × 時間変化
    if (data.adEnabled) {
      adSign = data.adInverted ? -1 : 1;
      if (keys.ArrowLeft || keys.KeyA || buttons.leftBtn) { velocity[adAxis] -= adSign * acceleration * delta; }
      if (keys.ArrowRight || keys.KeyD || buttons.rightBtn) { velocity[adAxis] += adSign * acceleration * delta; }
    }

    // 上下方向の速度を算出 加速度 × 時間変化
    const ySign = data.yInverted ? -1 : 1;
    if (keys.ShiftLeft || buttons.downBtn) { velocity[yAxis] -= ySign * acceleration * delta; }
    if (keys.Space || buttons.upBtn) { velocity[yAxis] += ySign * acceleration * delta; }

    // 奥行き方向の速度を算出 加速度 × 時間変化
    if (data.wsEnabled) {
        wsSign = data.wsInverted ? -1 : 1;
        if (keys.ArrowUp || keys.KeyW || buttons.forwardBtn) { velocity[wsAxis] -= wsSign * acceleration * delta; }
        if (keys.ArrowDown || keys.KeyS || buttons.backBtn) { velocity[wsAxis] += wsSign * acceleration * delta; }
    }
  },

  getMovementVector: (function () {
    let directionVector = new THREE.Vector3(0, 0, 0);

    return function (delta) {
      let rotation = this.el.getAttribute('rotation');
      let velocity = this.velocity;

      directionVector.copy(velocity);
      directionVector.multiplyScalar(delta);

      if (!rotation) { return directionVector; }

      const xRotation = this.data.fly ? rotation.x : 0;

      const rotationEuler = new THREE.Euler(0, 0, 0, 'YXZ');
      rotationEuler.set(degToRad(xRotation), degToRad(rotation.y), 0);
      directionVector.applyEuler(rotationEuler);
      return directionVector;
    };
  })(),

  attachVisibilityEventListeners: function () {
    window.oncontextmenu = this.onContextMenu;
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  },

  removeVisibilityEventListeners: function () {
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  },

  attachKeyEventListeners: function () {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  },

  removeKeyEventListeners: function () {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  },

  attachButtonEventListners: function () {
    let buttonEles = this.buttonEles;
    for (const buttonEle of buttonEles) {
        buttonEle.addEventListener("mousedown", this.onMouseDown);
        buttonEle.addEventListener("mouseup", this.onMouseUp);
        buttonEle.addEventListener("touchstart", this.onTouchStart);
        buttonEle.addEventListener("touchend", this.onTouchEnd);
    }
  },

  removeButtonEventListeners: function () {
      let buttonEles = this.buttonEles;
      for (const buttonEle of buttonEles) {
          buttonEle.removeEventListener("mousedown", this.onMouseDown);
          buttonEle.removeEventListener("mouseup", this.onMouseUp);
          buttonEle.addEventListener("touchstart", this.onTouchStart);
          buttonEle.addEventListener("touchend", this.onTouchEnd);
      }
  },

  onContextMenu: function () {
    let keys = Object.keys(this.keys);
    for (let i = 0; i < keys.length; i++) {
      delete this.keys[keys[i]];
    }
  },

  onBlur: function () {
    this.pause();
  },

  onFocus: function () {
    this.play();
  },

  onVisibilityChange: function () {
    if (document.hidden) {
      this.onBlur();
    } else {
      this.onFocus();
    }
  },

  onKeyDown: function (event) {
    if (!shouldCaptureKeyEvent(event)) {
      return;
    }
    this.shiftKey = event.shiftKey;
    const code = event.code || KEYCODE_TO_CODE[event.keyCode];
    if (KEYS.indexOf(code) !== -1) {
      this.keys[code] = true;
    }
  },

  onKeyUp: function (event) {
    const code = event.code || KEYCODE_TO_CODE[event.keyCode];
    delete this.keys[code];
  },

  onMouseDown: function (event) {
    let pushedBtn = event.srcElement.id;
    this.buttons[pushedBtn] = true;
  },

  onTouchStart: function (event) {
    let pushedBtn = event.srcElement.id;
    this.buttons[pushedBtn] = true;
  },

  onMouseUp: function (event) {
    let releasedBtn = event.srcElement.id;
    delete this.buttons[releasedBtn];
  },

  onTouchEnd: function (event) {
    let releasedBtn = event.srcElement.id;
    delete this.buttons[releasedBtn];
  }
});

function isEmptyObject (keys) {
  for (const key in keys) {
    return false;
  }
  return true;
}
