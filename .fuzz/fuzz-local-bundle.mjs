// .fuzz/compiled.js
import { Field, PrivateKey, Provable, SmartContract, State, assert, method, state } from "o1js";
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
var adminPrivateKey = PrivateKey.fromBase58("EKFcef5HKXAn7V2rQntLiXtJr15dkxrsrQ1G4pnYemhMEAWYbkZW");
var adminPublicKey = adminPrivateKey.toPublicKey();
var HelloWorld = class extends SmartContract {
  constructor() {
    super(...arguments);
    this.x = State();
  }
  init() {
    super.init();
    this.x.set(Field(2));
    this.account.delegate.set(adminPublicKey);
  }
  async update(squared, admin) {
    const x = await Provable.witnessAsync(Field, async () => {
      let x2 = await this.x.fetch();
      assert(x2 !== void 0, "x can be fetched");
      return x2;
    });
    this.x.requireNothing();
    x.square().assertEquals(squared);
    this.x.set(squared);
    const adminPk = admin.toPublicKey();
    this.account.delegate.requireEquals(adminPk);
  }
};
__decorate([
  state(Field),
  __metadata("design:type", Object)
], HelloWorld.prototype, "x", void 0);
__decorate([
  method,
  __metadata("design:type", Function),
  __metadata("design:paramtypes", [typeof (_a = typeof Field !== "undefined" && Field) === "function" ? _a : Object, typeof (_b = typeof PrivateKey !== "undefined" && PrivateKey) === "function" ? _b : Object]),
  __metadata("design:returntype", Promise)
], HelloWorld.prototype, "update", null);
export {
  HelloWorld,
  adminPrivateKey,
  adminPublicKey
};
