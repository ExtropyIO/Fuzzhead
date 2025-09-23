import {
    Field,
    SmartContract,
    state,
    State,
    method,
    Bool,
    UInt32,
    UInt64,
} from 'o1js';

/**
 * Extremely simple test contract that should pass fuzzing
 */
export class SimpleTestContract extends SmartContract {
    @state(Field) value = State<Field>();

    @method
    async init() {
        this.value.set(Field(0));
    }

    /**
     * Method that just sets a value - should always work
     */
    @method
    async setValue(newValue: Field) {
        this.value.set(newValue);
    }

    /**
     * Method that increments by 1 - should always work
     */
    @method
    async increment() {
        const current = this.value.get();
        this.value.requireEquals(current);
        this.value.set(current.add(Field(1)));
    }

    /**
     * Method that accepts any number and stores it
     */
    @method
    async storeNumber(num: UInt32) {
        this.value.set(Field.from(num.value));
    }

    /**
     * Method that just sets to zero
     */
    @method
    async reset() {
        this.value.set(Field(0));
    }
}
