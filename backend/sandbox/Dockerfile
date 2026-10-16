FROM alpine:3.19

# Install g++, libstdc++, musl-dev, coreutils, bash
RUN apk add --no-cache g++ libstdc++ musl-dev coreutils bash

# Create non-root runner user with limited privileges
RUN adduser -D -u 10001 sandboxuser

# Create sandbox workspace directory
WORKDIR /sandbox
RUN chown -R sandboxuser:sandboxuser /sandbox

USER sandboxuser

CMD ["/bin/sh"]
