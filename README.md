# Fuzzhead

A next-generation, multi-layered security fuzzing framework for privacy-preserving blockchains.

`Fuzzhead` is a specialized security tool designed to uncover critical vulnerabilities in the complex architectures of modern privacy-preserving blockchains. Standard EVM fuzzers are essential for testing application logic but are blind to the unique attack surfaces introduced by zero-knowledge (ZK) circuits and Trusted Execution Environments (TEEs). `Fuzzhead` provides a holistic, three-pronged security analysis to secure the entire stack, from dApps down to the core protocol.

## Project Status

**Current Focus: The Horizen Ecosystem**

We have successfully completed a foundational Proof of Concept (POC) of our fuzzing engine for the Mina ecosystem. This initial version validated our core approach to security analysis and demonstrated our team's capability to build effective, specialized fuzzing tools for complex cryptographic systems.

Building on the lessons learned from the Mina POC, we are now directing our full attention to developing `Fuzzhead` for the **Horizen ecosystem**. Our goal is to create a new, more advanced tool specifically tailored to the unique architecture of Horizen's L3 appchain on Base, which heavily utilizes both ZK-proofs and TEEs.

## The `Fuzzhead` Architecture

`Fuzzhead` is designed with a modular, three-engine architecture to provide comprehensive, full-stack security coverage for Horizen developers.

### 1. Application Layer Engine (EVM)

This engine provides robust, property-based fuzzing for the on-chain components of an application.
*   **Target:** EVM smart contracts written in **Solidity**.
*   **Purpose:** To detect common on-chain vulnerabilities such as re-entrancy, integer overflows/underflows, access control issues, and broken business logic invariants.
*   **Methodology:** Leverages property-based testing, similar to established tools like Echidna and Foundry, to automatically generate transaction sequences that attempt to violate predefined security properties.

### 2. Cryptographic Layer Engine (ZK-Circuits)

This is the core innovation of `Fuzzhead`. This engine targets the off-chain ZK circuits that are the foundation of Horizen's privacy technology.
*   **Targets:** Zero-knowledge circuits written in **Circom** and **Noir**.
*   **Purpose:** To uncover deep, logic-based flaws unique to ZK circuits, such as soundness vulnerabilities (allowing an invalid proof to be accepted) and completeness vulnerabilities (preventing a valid proof from being generated).
*   **Methodology:** Implements cutting-edge techniques like **program mutation** (inspired by zkFuzz) and **metamorphic testing** (inspired by Circuzz) to find under-constrained or incorrectly implemented circuit logic.

### 3. Protocol Layer Engine (TEE)

This engine provides a unique security analysis of Horizen's core protocol, targeting an attack surface that is completely invisible to other tools.
*   **Target:** The interface between the Horizen node software and the **op-enclave running within AWS Nitro Trusted Execution Environments (TEEs)**.
*   **Purpose:** To ensure the integrity of Horizen's core state transition and attestation mechanism. It tests for vulnerabilities where malformed inputs could crash the enclave, produce an invalid state, or trick the enclave into signing an incorrect attestation.
*   **Methodology:** Employs input fuzzing and state transition analysis to probe the boundary between the node and the secure enclave.

## Roadmap for Horizen

Our development is focused on delivering a powerful, open-source tool for the Horizen community.

*   **Phase 1: MVP Release**
    *   Develop and open-source the core `Fuzzhead` framework.
    *   Release the Application Layer Engine for Solidity contracts.
    *   Release an alpha version of the Cryptographic Layer Engine with initial support for Circom.

*   **Phase 2: Integration & Expansion**
    *   Partner with projects building on Horizen for pilot testing and integration feedback.
    *   Expand the Cryptographic Layer Engine to include full support for Noir.
    *   Develop and release a prototype of the Protocol Layer Engine for TEE testing.

*   **Phase 3: Full-Featured Release & Community Adoption**
    *   Achieve widespread adoption within the Horizen developer community.
    *   Release the complete, stable version of all three engines.
    *   Establish `Fuzzhead` as a standard security tool in the Horizen developer stack.

## Getting Started

Detailed installation and usage instructions for the Horizen-focused version of `Fuzzhead` will be available here upon the release of our MVP.

## Contributing

We welcome contributions from the security and developer communities! If you are interested in contributing to `Fuzzhead`, please read our `CONTRIBUTING.md` for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the `LICENSE.md` file for details.