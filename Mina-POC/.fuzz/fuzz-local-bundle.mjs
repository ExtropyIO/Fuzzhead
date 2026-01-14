// .fuzz/compiled.js
import { Field, SmartContract, state, State, method, Bool, UInt64, Provable } from "o1js";
var __decorate = function(decorators, target, key, desc) {
  var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
  return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = function(k, v) {
  if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
var _b;
var _c;
var _d;
var _e;
var _f;
var _g;
var _h;
var SuccessTestContract = class extends SmartContract {
  constructor() {
    super(...arguments);
    this.counter = State();
    this.total = State();
  }
  async init() {
    this.counter.set(Field(0));
    this.total.set(UInt64.from(0));
  }
  /**
   * Method that should always work
   */
  async increment(amount) {
    const current = this.counter.get();
    this.counter.requireEquals(current);
    this.counter.set(current.add(amount));
  }
  /**
   * Method that should work with any valid UInt64
   */
  async addToTotal(value) {
    const current = this.total.get();
    this.total.requireEquals(current);
    this.total.set(current.add(value));
  }
  /**
   * Method that works with boolean operations
   */
  async setBooleanState(flag) {
    this.counter.set(Provable.if(flag, Field(1), Field(0)));
  }
  /**
   * Method with simple arithmetic that should work
   */
  async multiply(a, b) {
    const result = a.mul(b);
    this.counter.set(result);
  }
  /**
   * Method that combines multiple fields
   */
  async combine(x, y, z) {
    const combined = x.add(y).add(z);
    this.total.set(UInt64.from(combined.toString()));
  }
};
__decorate([
  state(Field),
  __metadata("design:type", Object)
], SuccessTestContract.prototype, "counter", void 0);
__decorate([
  state(UInt64),
  __metadata("design:type", Object)
], SuccessTestContract.prototype, "total", void 0);
__decorate([
  method,
  __metadata("design:type", Function),
  __metadata("design:paramtypes", []),
  __metadata("design:returntype", Promise)
], SuccessTestContract.prototype, "init", null);
__decorate([
  method,
  __metadata("design:type", Function),
  __metadata("design:paramtypes", [typeof (_a = typeof Field !== "undefined" && Field) === "function" ? _a : Object]),
  __metadata("design:returntype", Promise)
], SuccessTestContract.prototype, "increment", null);
__decorate([
  method,
  __metadata("design:type", Function),
  __metadata("design:paramtypes", [typeof (_b = typeof UInt64 !== "undefined" && UInt64) === "function" ? _b : Object]),
  __metadata("design:returntype", Promise)
], SuccessTestContract.prototype, "addToTotal", null);
__decorate([
  method,
  __metadata("design:type", Function),
  __metadata("design:paramtypes", [typeof (_c = typeof Bool !== "undefined" && Bool) === "function" ? _c : Object]),
  __metadata("design:returntype", Promise)
], SuccessTestContract.prototype, "setBooleanState", null);
__decorate([
  method,
  __metadata("design:type", Function),
  __metadata("design:paramtypes", [typeof (_d = typeof Field !== "undefined" && Field) === "function" ? _d : Object, typeof (_e = typeof Field !== "undefined" && Field) === "function" ? _e : Object]),
  __metadata("design:returntype", Promise)
], SuccessTestContract.prototype, "multiply", null);
__decorate([
  method,
  __metadata("design:type", Function),
  __metadata("design:paramtypes", [typeof (_f = typeof Field !== "undefined" && Field) === "function" ? _f : Object, typeof (_g = typeof Field !== "undefined" && Field) === "function" ? _g : Object, typeof (_h = typeof Field !== "undefined" && Field) === "function" ? _h : Object]),
  __metadata("design:returntype", Promise)
], SuccessTestContract.prototype, "combine", null);
export {
  SuccessTestContract
};
