# Runs the YNAB contract checks (task 8) in a container, so the owner needs only Docker.
# The checks use plain fetch and no packages, so the image holds Node and two scripts.
# See the header of scripts/contract-checks.ts for the options.
#
#   docker build -f scripts/contract-checks.Dockerfile -t ynot-contract-checks .
#   docker run --rm -it -e YNAB_PAT -e YNAB_PLAN_ID \
#     -v "$PWD/docs/research:/out" ynot-contract-checks --report /out/ynab-contract-checks.md
#
# The PAT is passed by name from the host environment, so it is never in the image, the command
# line or shell history.
FROM node:24-alpine
WORKDIR /app
COPY scripts/contract-checks.ts scripts/contractChecks.ts ./scripts/
USER node
ENTRYPOINT ["node", "scripts/contract-checks.ts"]
