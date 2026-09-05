export const element=<T extends HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
export function mountPanel() {
  element('#app').innerHTML=`
    <header class="masthead"><span>A LITTLE DESSERT LAB <i>/</i> NO. 001</span><span id="gpu-status" class="status"><b></b> WARMING UP</span></header>
    <section class="intro" aria-labelledby="title"><h1 id="title">Soft<br><em>Pudding.</em></h1><p>A little caramel.<br>A little gravity.<br>A very happy wobble.</p></section>
    <main id="stage" aria-label="Interactive pudding"><canvas id="scene" aria-label="Drag the pudding to stretch it. Use the nudge button for a keyboard alternative."></canvas><div id="scene-message" role="status">Preparing something sweet<span></span></div><button id="retry" hidden>Try again</button></main>
    <section class="caption"><p>Grab. Stretch. Let go.</p><span>A small moment of sweetness.</span><div class="readings"><div><output id="volume">100.0%</output><small>REST VOLUME</small></div><div><output id="motion">0.00</output><small>MOTION</small></div><div><output id="state">Settling</output><small>THE MOMENT</small></div></div></section>
    <aside class="controls" aria-label="Pudding controls">
      <div class="panel-heading"><h2>THE PUDDING</h2><span id="flavor-number">01 / 03</span></div>
      <div class="flavors" role="group" aria-label="Flavor"><button data-flavor="vanilla" aria-pressed="true"><i></i>Vanilla</button><button data-flavor="berry" aria-pressed="false"><i></i>Berry</button><button data-flavor="matcha" aria-pressed="false"><i></i>Matcha</button></div>
      <label class="slider-label" for="firmness">Firmness <output id="firmness-value">Soft</output></label><input id="firmness" type="range" min="0" max="100" value="45" aria-describedby="firmness-value">
      <label class="slider-label" for="damping">Internal damping <output id="damping-value">Gentle</output></label><input id="damping" type="range" min="0" max="100" value="38" aria-describedby="damping-value">
      <div class="actions"><button id="nudge">Give it a nudge <span>↗</span></button><button id="reset">Reset</button></div>
      <div class="toggles"><label><input id="slow" type="checkbox">¼ speed</label><label><input id="mesh" type="checkbox">Show mesh</label><button id="pause" aria-pressed="false">Pause</button></div>
      <details id="about"><summary>Inside the experiment <span>+</span></summary><p>A soft solid, with a sweet side. Grab a little piece and feel the rest follow.</p><p>Shape is simulated with volume constraints. Motion is measured from the moving pudding. Flavor changes its appearance.</p><small>THREE.JS · WEBGPU · XPBD</small><a href="?inspect=1" class="inspect-link">Open rendering diagnostics ↗</a></details>
    </aside>
    <footer>MADE TO BE PLAYED WITH <span>VANILLA DAYS, SOFT MOMENTS.</span></footer>
    <button id="inspector-toggle" hidden>Diagnostics</button><section id="diagnostics" hidden aria-label="Rendering diagnostics"><h2>Rendering diagnostics</h2><pre id="device-info"></pre><button id="benchmark">Record 60 seconds</button><output id="benchmark-status">Ready</output><pre id="benchmark-result"></pre><button id="compression-check">Hold 30% compression</button><button id="release-check">Release test grip</button><pre id="physics-info"></pre></section>`;
}
