import { SoftBody } from './soft-body.ts';
export class Simulation {
  readonly body=new SoftBody();
  readonly stepSize=1/240;
  private accumulator=0;
  paused=false;
  slow=false;
  hidden=false;
  time=0;
  get alpha(){return this.accumulator/this.stepSize;}
  advance(elapsed:number) {
    if(this.paused||this.hidden)return 0;
    this.accumulator+=Math.min(.05,Math.max(0,elapsed))*(this.slow?.25:1);
    let steps=0;
    while(this.accumulator>=this.stepSize && steps<12) {
      this.body.step(this.stepSize);this.accumulator-=this.stepSize;this.time+=this.stepSize;steps++;
    }
    return steps;
  }
  pause(value:boolean) {this.paused=value;this.stopInput();}
  visibility(hidden:boolean) {this.hidden=hidden;this.stopInput();}
  private stopInput(){this.accumulator=0;this.body.release();this.body.previous.set(this.body.position);}
  reset(drop=0) {
    this.paused=false;this.slow=false;this.time=0;this.accumulator=0;
    this.body.firmness=.45;this.body.damping=3.04;this.body.reset(drop);
  }
  nudge(){if(!this.paused&&!this.hidden)this.body.nudge();}
}
