import {
    Field,
    SmartContract,
    state,
    State,
    method,
    Bool,
    UInt32,
    UInt64,
    Provable,
} from 'o1js';

/**
 * Test contract designed to mostly succeed during fuzzing
 */
export class SuccessTestContract extends SmartContract {
    @state(Field) counter = State<Field>();
    @state(UInt64) total = State<UInt64>();

    @method
    async init() {
        this.counter.set(Field(0));
        this.total.set(UInt64.from(0));
    }

    /**
     * Method that should always work
     */
    @method
    async increment(amount: Field) {
        const current = this.counter.get();
        this.counter.requireEquals(current);
        this.counter.set(current.add(amount));
    }

    /**
     * Method that should work with any valid UInt64
     */
    @method
    async addToTotal(value: UInt64) {
        const current = this.total.get();
        this.total.requireEquals(current);
        this.total.set(current.add(value));
    }

    /**
     * Method that works with boolean operations
     */
    @method
    async setBooleanState(flag: Bool) {
        // Just set the counter to 0 or 1 based on flag
        this.counter.set(Provable.if(flag, Field(1), Field(0)));
    }

    /**
     * Method with simple arithmetic that should work
     */
    @method
    async multiply(a: Field, b: Field) {
        const result = a.mul(b);
        this.counter.set(result);
    }

    /**
     * Method that combines multiple fields
     */
    @method
    async combine(x: Field, y: Field, z: Field) {
        const combined = x.add(y).add(z);
        this.total.set(UInt64.from(combined.toString()));
    }
}
