import {
    SmartContract,
    Field,
    Bool,
    State,
    state,
    method,
} from 'o1js';

/**
 * A slightly more complex demo contract for the fuzzer.
 * – keeps a running sum
 * – can multiply two numbers
 * – tracks an on/off flag
 */
export class DemoContract extends SmartContract {
    /* ------------------------------------------------------------
     *                       Contract State
     * ---------------------------------------------------------- */
    @state(Field) sum = State<Field>();
    @state(Bool) enabled = State<Bool>();

    /* ------------------------------------------------------------
     *                       Constructor
     * ---------------------------------------------------------- */
    @method init(initialValue: Field) {
        // Initialize stored variables
        this.sum.set(initialValue);
        this.enabled.set(Bool(true));
    }

    /* ------------------------------------------------------------
     *               Simple mutating / reading methods
     * ---------------------------------------------------------- */
    @method add(value: Field) {
        const current = this.sum.get();
        this.sum.set(current.add(value));
    }

    @method multiply(a: Field, b: Field): Field {
        return a.mul(b);
    }

    @method toggle() {
        const current = this.enabled.get();
        this.enabled.set(current.not());
    }

    @method isGreaterThan(x: Field): Bool {
        const current = this.sum.get();
        return current.greaterThan(x);
    }
}