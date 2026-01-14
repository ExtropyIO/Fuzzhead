import {
    Field,
    SmartContract,
    state,
    State,
    method,
    PublicKey,
    Bool,
    UInt32,
    UInt64,
    Permissions,
    AccountUpdate,
} from 'o1js';

/**
 * Test contract designed to fail during fuzzing to test error handling
 */
export class FailTestContract extends SmartContract {
    @state(Field) counter = State<Field>();
    @state(UInt64) balance = State<UInt64>();
    @state(Bool) isActive = State<Bool>();

    async deploy() {
        await super.deploy();
        this.account.permissions.set({
            ...Permissions.default(),
            editState: Permissions.proofOrSignature(),
        });
        this.counter.set(Field(0));
        this.balance.set(UInt64.from(1000));
        this.isActive.set(Bool(true));
    }

    @method
    async init() {
        // This should work fine
        this.counter.set(Field(0));
        this.balance.set(UInt64.from(1000));
        this.isActive.set(Bool(true));
    }

    /**
     * Method that always fails with assertion
     */
    @method
    async alwaysFails(amount: UInt64) {
        // This will always fail
        amount.assertEquals(UInt64.from(999999999), 'Amount must be exactly 999999999');
    }

    /**
     * Method that fails on specific conditions
     */
    @method
    async sometimesFails(value: Field) {
        const current = this.counter.get();
        this.counter.requireEquals(current);

        // Fail if value is greater than 100
        value.assertLessThanOrEqual(Field(100), 'Value too large!');

        this.counter.set(current.add(value));
    }

    /**
     * Method that fails on division by zero
     */
    @method
    async divisionTest(numerator: Field, denominator: Field) {
        // This will fail when denominator is 0
        denominator.assertNotEquals(Field(0), 'Division by zero!');

        const result = numerator.div(denominator);
        this.counter.set(result);
    }

    /**
     * Method that fails on balance checks
     */
    @method
    async withdraw(amount: UInt64) {
        const currentBalance = this.balance.get();
        this.balance.requireEquals(currentBalance);

        // Will fail if trying to withdraw more than balance
        currentBalance.assertGreaterThanOrEqual(amount, 'Insufficient balance!');

        this.balance.set(currentBalance.sub(amount));
    }

    /**
     * Method that fails when contract is inactive
     */
    @method
    async requireActive(newValue: Field) {
        const active = this.isActive.get();
        this.isActive.requireEquals(active);

        // Will fail if contract is inactive
        active.assertTrue('Contract is not active!');

        this.counter.set(newValue);
    }

    /**
     * Method that toggles active state
     */
    @method
    async toggleActive() {
        const current = this.isActive.get();
        this.isActive.requireEquals(current);
        this.isActive.set(current.not());
    }

    /**
     * Method that fails on specific public key
     */
    @method
    async restrictedAccess(caller: PublicKey) {
        // Create a specific public key that should fail
        const restrictedKey = PublicKey.fromBase58('B62qmXFNvz2sfYZDuHn4dqs5T8Yjf7kqLDbXgpzJNQPqU5MvPZ8LM7P');

        // Fail if caller is the restricted key
        caller.equals(restrictedKey).assertFalse('Access denied for this key!');
    }

    /**
     * Method that performs multiple checks and can fail at different points
     */
    @method
    async complexChecks(value1: Field, value2: UInt64, flag: Bool) {
        // Check 1: value1 must be positive
        value1.assertGreaterThan(Field(0), 'Value1 must be positive');

        // Check 2: value2 must be less than 1000
        value2.assertLessThan(UInt64.from(1000), 'Value2 must be less than 1000');

        // Check 3: flag must be true
        flag.assertTrue('Flag must be true');

        // Check 4: combination check
        const combined = value1.add(Field.from(value2.toString()));
        combined.assertLessThan(Field(500), 'Combined value too large');

        this.counter.set(combined);
    }

    /**
     * Method that uses account updates and can fail
     */
    @method
    async accountUpdateTest(targetKey: PublicKey, requiredBalance: UInt64) {
        const accountUpdate = AccountUpdate.create(targetKey);
        const balance = accountUpdate.account.balance.get();
        accountUpdate.account.balance.requireEquals(balance);

        // Will fail if target account doesn't have enough balance
        balance.assertGreaterThanOrEqual(requiredBalance, 'Target account balance too low');
    }

    /**
     * Method that should work most of the time
     */
    @method
    async mostlyWorks(increment: Field) {
        const current = this.counter.get();
        this.counter.requireEquals(current);

        // Only fail if increment is exactly 777
        increment.equals(Field(777)).assertFalse('Lucky number 777 is not allowed!');

        this.counter.set(current.add(increment));
    }
}
