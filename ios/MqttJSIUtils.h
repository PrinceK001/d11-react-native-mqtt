//
//  MqttJSIUtils.h
//  d11-mqtt
//
//  Created by Vibhor Verma on 31/10/23.
//


#import <Foundation/Foundation.h>
#import <jsi/jsi.h>
#import <React/RCTBridgeModule.h>


namespace jsi = facebook::jsi;

namespace mqtt {

jsi::Value convertNSNumberToJSIBoolean(jsi::Runtime &runtime, NSNumber *value);
jsi::Value convertNSNumberToJSINumber(jsi::Runtime &runtime, NSNumber *value);
jsi::String convertNSStringToJSIString(jsi::Runtime &runtime, NSString *value);
jsi::Value convertObjCObjectToJSIValue(jsi::Runtime &runtime, id value);;
jsi::Object convertNSDictionaryToJSIObject(jsi::Runtime &runtime, NSDictionary *value);
jsi::Array convertNSArrayToJSIArray(jsi::Runtime &runtime, NSArray *value);
std::vector<jsi::Value> convertNSArrayToStdVector(jsi::Runtime &runtime, NSArray *value);
jsi::Value convertObjCObjectToJSIValue(jsi::Runtime &runtime, id value);
id convertJSIValueToObjCObject(
                               jsi::Runtime &runtime,
                               const jsi::Value &value);
NSString* convertJSIStringToNSString(jsi::Runtime &runtime, const jsi::String &value);
NSArray* convertJSIArrayToNSArray(
                                  jsi::Runtime &runtime,
                                  const jsi::Array &value);
NSDictionary *convertJSIObjectToNSDictionary(
                                             jsi::Runtime &runtime,
                                             const jsi::Object &value);
RCTResponseSenderBlock convertJSIFunctionToCallback(
                                                    jsi::Runtime &runtime,
                                                    const jsi::Function &value);
id convertJSIValueToObjCObject(
                               jsi::Runtime &runtime,
                               const jsi::Value &value);
RCTResponseSenderBlock convertJSIFunctionToCallback(
                                                    jsi::Runtime &runtime,
                                                    const jsi::Function &value);

struct Promise {
    Promise(jsi::Runtime &rt, jsi::Function resolve, jsi::Function reject);
    void resolve(const jsi::Value &result);
    void reject(const std::string &error);
    jsi::Runtime &runtime_;
    jsi::Function resolve_;
    jsi::Function reject_;
};

using PromiseSetupFunctionType =
std::function<void(jsi::Runtime &rt, std::shared_ptr<Promise>)>;
jsi::Value createPromiseAsJSIValue(
                                   jsi::Runtime &rt,
                                   const PromiseSetupFunctionType func);


inline void registerCxxFunction(
                                jsi::Runtime &runtime, jsi::Object &object, const char *name, unsigned int argc, jsi::HostFunctionType function)
{
    auto jsiFunction =
    jsi::Function::createFromHostFunction(runtime, jsi::PropNameID::forAscii(runtime, name), argc, function);
    object.setProperty(runtime, name, std::move(jsiFunction));
}

}

