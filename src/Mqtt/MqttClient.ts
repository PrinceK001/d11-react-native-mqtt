import {
  CONNECTION_STATE,
  MQTT_EVENTS,
  Mqtt5ReasonCode,
  MqttQos,
} from './MqttClient.constants';
import type {
  MqttConnect,
  MqttEventsInterface,
  MqttOptions,
} from './MqttClient.interface';
import { EventEmitter } from './EventEmitter';
import { getMqttBackoffTime } from './MqttClient.utils';
import { MqttJSIModule } from '../Modules/mqtt-module';

/**
 * MqttClient class represents an MQTT client with functionalities for connection management, event handling, and message subscription.
 * It interfaces with the native MqttModule to perform MQTT operations.
 */
export class MqttClient {
  private eventEmitter: EventEmitter = EventEmitter.getInstance();

  private retryTimer: NodeJS.Timeout | undefined;

  private currentRetryCount = 0;

  private mqtt5DisconnectReasonCode?: Mqtt5ReasonCode;

  private tag = 0;

  private connectionStatus = CONNECTION_STATE.DISCONNECTED;

  private onReconnectIntercepter?: (
    mqtt5ReasonCode?: Mqtt5ReasonCode
  ) => Promise<MqttConnect | undefined>;

  /**
   * Constructor for MqttClient.
   * Initializes the MQTT client with provided configuration.
   * @param clientId The unique identifier for the MQTT client.
   * @param host The host address of the MQTT broker.
   * @param port The port number on which the MQTT broker is listening.
   * @param options Additional options for configuring the MQTT client.
   */
  constructor(
    private clientId: string,
    private host: string,
    private port: number,
    private options?: MqttOptions
  ) {
    if (!host) {
      return;
    }

    /**
     * Function call to create an MQTT client instance using the native module.
     * It initializes an MQTT client with the specified parameters such as client ID, host, port, and SSL configuration.
     * This function is responsible for creating the MQTT client instance.
     * @param clientId The unique identifier for the MQTT client.
     * @param host The hostname or IP address of the MQTT broker.
     * @param port The port number of the MQTT broker.
     * @param enableSslConfig A boolean indicating whether SSL/TLS configuration should be enabled (default: false).
     *                        If true, the client uses SSL/TLS for secure communication with the MQTT broker.
     */
    MqttJSIModule.createMqtt(
      clientId,
      host,
      port,
      options?.enableSslConfig ?? false
    );

    this.setOnConnectCallback(
      (ack: MqttEventsInterface[MQTT_EVENTS.CONNECTED_EVENT]) => {
        console.log(
          `::MQTT Client: connected to mqtt://${this.host}:${
            this.port
          } with clientId: ${this.clientId} with response: ${JSON.stringify(
            ack
          )}`
        );
        this.currentRetryCount = 0;
        this.connectionStatus = CONNECTION_STATE.CONNECTED;
        this.mqtt5DisconnectReasonCode = undefined;
      }
    );

    /**
     * Conditional block to handle automatic reconnection if the autoReconnect option is enabled.
     * If the MQTT client gets disconnected and autoReconnect is set to true, it will attempt to reconnect
     * using exponential backoff and optionally updated options.
     * @param options?.autoReconnect A boolean indicating whether to enable automatic reconnection (default: false).
     * @remarks This block sets up an interceptor for disconnection events. When a disconnection occurs, it
     *          checks the current connection status, and attempts to reconnect if previously connected.
     *          retrieves new connection options (like a new authentication token) using the onReconnectIntercepter callback,
     *          and calls the connect method with the updated options. Finally, it updates the disconnect reason code.
     */

    if (options?.autoReconnect) {
      this.onDisconnectInterceptor(async (ack) => {
        console.log(
          `::MQTT Client: disconnected due to reasonCode: ${
            ack.reasonCode
          }, where previous disconnected reasonCode: ${
            this.mqtt5DisconnectReasonCode
          }. Response: ${JSON.stringify(ack)}`
        );
        if (this.connectionStatus === CONNECTION_STATE.CONNECTED) {
          console.log(
            '::MQTT Client: client is previously connected but disconnected now, so reconnecting with expo backoff'
          );
          const newOptions = await this.onReconnectIntercepter?.(
            this.mqtt5DisconnectReasonCode
          );
          this.connect(newOptions);
        }
        this.mqtt5DisconnectReasonCode = ack.reasonCode;
      });
    }
  }

  /**
   * Private method to handle MQTT connection.
   * It retries connection based on configured options.
   */
  private connection() {
    if (this.connectionStatus !== CONNECTION_STATE.CONNECTING) {
      return;
    }

    /**
     * Function call to initiate a connection to the MQTT broker using the native module.
     * It provides connection parameters such as client ID, keep-alive interval, username, password, and clean session flag.
     * This function is responsible for establishing the connection with the MQTT broker.
     * @param clientId The unique identifier for the MQTT client.
     * @param options An object containing optional connection parameters:
     *                - keepAlive: The interval in seconds between PINGREQ packets sent by the client to the broker (default: 60).
     *                - username: The username for authenticating with the MQTT broker (default: '').
     *                - password: The password for authenticating with the MQTT broker (default: '').
     *                - cleanSession: A boolean indicating whether to start a clean session (default: true).
     *                                If true, the broker discards any previous session state.
     */
    MqttJSIModule.connectMqtt(this.clientId, {
      keepAlive: this.options?.keepAlive || 60,
      username: this.options?.username || '',
      password: this.options?.password || '',
      cleanSession: this.options?.cleanSession || true,
    });

    clearTimeout(this.retryTimer);
    if (
      this.options?.retryCount &&
      this.currentRetryCount < this.options?.retryCount
    ) {
      this.retryTimer = setTimeout(async () => {
        this.currentRetryCount++;
        const connectionStatus = this.getConnectionStatus();
        if (connectionStatus !== CONNECTION_STATE.CONNECTED) {
          const newOptions = await this.onReconnectIntercepter?.(
            this.mqtt5DisconnectReasonCode
          );
          console.log(
            `::MQTT Client: Current connection status is ${connectionStatus} so reconnecting with exponential backoff. Retry count: ${this.currentRetryCount} with previous disconnection reasonCode: ${this.mqtt5DisconnectReasonCode}, where max allowed reties: ${this.options?.retryCount}`
          );
          this.resetOptions(newOptions);
          this.connection();
        }
      }, getMqttBackoffTime(this.options.backoffTime, this.currentRetryCount ?? 1, this.options.maxBackoffTime, this.options.jitter));
    }
  }

  /**
   * Method to set a callback for disconnect event interception.
   * @param callback Callback function to handle disconnect events.
   * @returns An object with a remove method to remove the listener.
   */
  private onDisconnectInterceptor(
    callback: (ack: MqttEventsInterface[MQTT_EVENTS.DISCONNECTED_EVENT]) => void
  ) {
    const listener = this.eventEmitter.addListener<
      MqttEventsInterface[MQTT_EVENTS.DISCONNECTED_EVENT]
    >(this.clientId + MQTT_EVENTS.DISCONNECTED_EVENT, (ack) => {
      try {
        callback(ack);
      } catch (e) {
        callback({
          reasonCode: Mqtt5ReasonCode.DEFAULT,
        });
      }
    });
    return {
      remove: listener.remove,
    };
  }

  /**
   * Private method to reset connection-related variables when initiating a connection attempt.
   * It sets the current retry count to zero and updates the connection status to 'connecting'.
   * This method is typically called before starting a new connection attempt.
   */
  private resetConnectVariables() {
    this.currentRetryCount = 0;
    this.connectionStatus = CONNECTION_STATE.CONNECTING;
  }

  /**
   * Method to get prefix for identifying MQTT events.
   */
  private getIdPrefix() {
    return `mqtt_client#${this.clientId}`;
  }

  /**
   * Method to reset MQTT client options.
   * @param options New options to be merged with existing options.
   */
  private resetOptions(options?: MqttOptions) {
    if (options) {
      this.options = { ...this.options, ...options };
    }
  }

  /**
   * Method to generate subscription event identifier.
   * @param topic MQTT topic for subscription.
   * @param qos Quality of Service for subscription.
   */
  private getMqttSubscribeEventId(topic: string, qos: MqttQos) {
    return `${this.getIdPrefix()}#subscribe_mqtt#${topic}#${qos}#${++this.tag}`;
  }

  /**
   * Method to connect MQTT client to the broker.
   * @param options Optional new options for connection.
   */
  connect(options?: MqttOptions) {
    this.resetConnectVariables();
    this.resetOptions(options);
    this.connection();
  }

  /**
   * Method to set a callback for intercepting and passing new options (example new auth token) once disconnected by MQTT broker.
   * @param callback Callback function to handle reconnect attempts.
   */
  setOnReconnectIntercepter(
    callback: (
      mqtt5ReasonCode?: Mqtt5ReasonCode
    ) => Promise<MqttConnect | undefined>
  ) {
    this.onReconnectIntercepter = callback;
  }

  /**
   * Method to set a callback for successful connection.
   * @param callback Callback function to handle successful connection.
   * @returns An object with a remove method to remove the listener.
   */
  setOnConnectCallback(
    callback: (ack: MqttEventsInterface[MQTT_EVENTS.CONNECTED_EVENT]) => void
  ) {
    const listener = this.eventEmitter.addListener<
      MqttEventsInterface[MQTT_EVENTS.CONNECTED_EVENT]
    >(this.clientId + MQTT_EVENTS.CONNECTED_EVENT, callback);
    return {
      remove: listener.remove,
    };
  }

  /**
   * Method to set a callback for handling connection failure events.
   * @param callback Callback function to handle connection failure events.
   *                 It receives the MQTT 5 reason code as an argument.
   * @returns An object with a remove method to remove the listener.
   */
  setOnConnectFailureCallback(
    callback: (mqtt5ReasonCode: Mqtt5ReasonCode) => void
  ) {
    const listener = this.onDisconnectInterceptor(({ reasonCode }) => {
      if (this.connectionStatus === CONNECTION_STATE.CONNECTING) {
        callback(reasonCode);
      }
    });
    return {
      remove: listener.remove,
    };
  }

  /**
   * Method to set a callback for handling disconnection events.
   * @param callback Callback function to handle disconnection events.
   *                 It receives the MQTT 5 reason code and additional options as arguments.
   *                 The options include information about the disconnect type ('forceDisconnected' or 'autoDisconnected')
   *                 and the number of retry attempts made.
   * @returns An object with a remove method to remove the listener.
   */
  setOnDisconnectCallback(
    callback: (
      mqtt5ReasonCode: Mqtt5ReasonCode,
      options: MqttConnect & {
        disconnectType: 'forceDisconnected' | 'autoDisconnected';
        retryCount: number;
      }
    ) => void
  ) {
    const listener = this.onDisconnectInterceptor(({ reasonCode }) => {
      if (this.connectionStatus !== CONNECTION_STATE.CONNECTING) {
        callback(reasonCode, {
          ...this.options,
          disconnectType:
            this.connectionStatus === CONNECTION_STATE.DISCONNECTED
              ? 'forceDisconnected'
              : 'autoDisconnected',
          retryCount: this.currentRetryCount,
        });
      }
    });
    return {
      remove: listener.remove,
    };
  }

  /**
   * Method to subscribe to an MQTT topic with the specified Quality of Service (QoS).
   * @param topic The MQTT topic to subscribe to.
   * @param qos The Quality of Service level for the subscription (default is QoS 1).
   * @param onEvent Callback function to handle incoming messages for the subscribed topic.
   * @param onSuccess Optional callback function to handle subscription success event.
   * @param onError Optional callback function to handle subscription failure event.
   * @returns An object with a remove method to unsubscribe from the topic.
   */
  subscribe({
    topic,
    qos = 1,
    onEvent,
    onSuccess = () => {},
    onError = () => {},
  }: {
    topic: string;
    qos?: MqttQos;
    onEvent: (
      payload: MqttEventsInterface[MQTT_EVENTS.SUBSCRIPTION_EVENT]
    ) => void;
    onSuccess?: (
      ack: MqttEventsInterface[MQTT_EVENTS.SUBSCRIPTION_SUCCESS_EVENT]
    ) => void;
    onError?: (
      error: MqttEventsInterface[MQTT_EVENTS.SUBSCRIPTION_FAILED_EVENT]
    ) => void;
  }) {
    const eventId = this.getMqttSubscribeEventId(topic, qos);
    MqttJSIModule.subscribeMqtt(eventId, this.clientId, topic, qos);

    const listener = this.eventEmitter.addListener<
      MqttEventsInterface[MQTT_EVENTS.SUBSCRIPTION_EVENT]
    >(eventId, onEvent);

    const success = this.eventEmitter.addListener<
      MqttEventsInterface[MQTT_EVENTS.SUBSCRIPTION_SUCCESS_EVENT]
    >(eventId + MQTT_EVENTS.SUBSCRIPTION_SUCCESS_EVENT, onSuccess);

    const failed = this.eventEmitter.addListener<
      MqttEventsInterface[MQTT_EVENTS.SUBSCRIPTION_FAILED_EVENT]
    >(eventId + MQTT_EVENTS.SUBSCRIPTION_FAILED_EVENT, onError);

    return {
      remove: () => {
        listener.remove();
        success.remove();
        failed.remove();
      },
    };
  }

  /**
   * Method to retrieve the current connection status of the MQTT client.
   * @returns The current connection status, which can be one of the following values:
   *          - 'connected': Indicates that the client is currently connected to the MQTT broker.
   *          - 'connecting': Indicates that the client is in the process of establishing a connection.
   *          - 'disconnected': Indicates that the client is not currently connected to the MQTT broker.
   */
  getConnectionStatus() {
    return MqttJSIModule.getConnectionStatusMqtt(this.clientId);
  }

  /**
   * Method to disconnect the MQTT client from the broker.
   * It updates the connection status to 'disconnected' and triggers disconnection using the native module.
   */
  disconnect() {
    this.connectionStatus = CONNECTION_STATE.DISCONNECTED;
    MqttJSIModule.disconnectMqtt(this.clientId);
  }

  /**
   * Method to remove the MQTT client and its event listeners.
   */
  remove() {
    MqttJSIModule.removeMqtt(this.clientId);

    this.eventEmitter.removeAllListeners(
      this.clientId + MQTT_EVENTS.DISCONNECTED_EVENT
    );
    this.eventEmitter.removeAllListeners(
      this.clientId + MQTT_EVENTS.CONNECTED_EVENT
    );
  }
}