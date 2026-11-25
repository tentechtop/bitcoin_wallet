const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
        <domain includeSubdomains="false">[::1]</domain>
    </domain-config>
</network-security-config>
`;

function withAndroidNetworkSecurityConfig(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (application) {
      application.$ = application.$ || {};
      application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
      application.$['android:usesCleartextTraffic'] = 'false';
    }
    return modConfig;
  });

  return withDangerousMod(config, ['android', async (modConfig) => {
    const resourceDirectory = path.join(
      modConfig.modRequest.platformProjectRoot,
      'app',
      'src',
      'main',
      'res',
      'xml'
    );
    fs.mkdirSync(resourceDirectory, { recursive: true });
    fs.writeFileSync(path.join(resourceDirectory, 'network_security_config.xml'), NETWORK_SECURITY_CONFIG);
    return modConfig;
  }]);
}

module.exports = withAndroidNetworkSecurityConfig;
