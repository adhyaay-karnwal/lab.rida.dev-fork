"use client";

import { useState } from "react";
import { Button } from "@lab/ui/components/button";
import { Input } from "@lab/ui/components/input";
import { Textarea } from "@lab/ui/components/textarea";
import { Badge } from "@lab/ui/components/badge";
import { Avatar, AvatarGroup } from "@lab/ui/components/avatar";
import { Card, CardHeader, CardContent, CardFooter } from "@lab/ui/components/card";
import { Skeleton } from "@lab/ui/components/skeleton";
import { Spinner } from "@lab/ui/components/spinner";
import { Tooltip } from "@lab/ui/components/tooltip";
import { Modal, ModalHeader, ModalContent, ModalFooter } from "@lab/ui/components/modal";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSeparator,
} from "@lab/ui/components/dropdown";
import { Select } from "@lab/ui/components/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@lab/ui/components/tabs";
import { ToastProvider, useToast } from "@lab/ui/components/toast";
import { EmptyState } from "@lab/ui/components/empty-state";
import { Heading } from "@lab/ui/components/heading";
import { Copy } from "@lab/ui/components/copy";

function ToastDemo() {
  const { addToast } = useToast();
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        onClick={() => addToast({ message: "Success message", variant: "success" })}
      >
        Success
      </Button>
      <Button size="sm" onClick={() => addToast({ message: "Error message", variant: "error" })}>
        Error
      </Button>
      <Button
        size="sm"
        onClick={() => addToast({ message: "Warning message", variant: "warning" })}
      >
        Warning
      </Button>
      <Button size="sm" onClick={() => addToast({ message: "Info message", variant: "info" })}>
        Info
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border pb-8">
      <Heading as="h2" size="xl" className="mb-4">
        {title}
      </Heading>
      {children}
    </section>
  );
}

export default function DemoPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [textareaValue, setTextareaValue] = useState("");
  const [selectValue, setSelectValue] = useState("");

  return (
    <ToastProvider>
      <div className="min-h-screen bg-background text-foreground p-8">
        <Heading as="h1" className="mb-8">
          UI Component Library
        </Heading>

        <div className="max-w-4xl space-y-8">
          <Section title="Typography">
            <div className="space-y-4">
              <div className="space-y-2">
                <Heading as="h1">Heading 1</Heading>
                <Heading as="h2">Heading 2</Heading>
                <Heading as="h3">Heading 3</Heading>
                <Heading as="h4">Heading 4</Heading>
                <Heading as="h5">Heading 5</Heading>
                <Heading as="h6">Heading 6</Heading>
              </div>
              <div className="space-y-2 mt-6">
                <Copy size="lg">Large copy text</Copy>
                <Copy>Base copy text (default)</Copy>
                <Copy size="sm">Small copy text</Copy>
                <Copy size="xs">Extra small copy text</Copy>
                <Copy muted>Muted copy text</Copy>
                <Copy as="span">Inline span text</Copy>
              </div>
            </div>
          </Section>

          <Section title="Button">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="link">Link</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled>Disabled</Button>
                <Button loading>Loading</Button>
              </div>
            </div>
          </Section>

          <Section title="Input">
            <div className="space-y-4 max-w-sm">
              <Input
                placeholder="Default input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
              />
              <Input placeholder="With error" error />
              <Input placeholder="Disabled" disabled />
              <Input
                placeholder="With left icon"
                leftIcon={
                  <Copy as="span" size="sm">
                    @
                  </Copy>
                }
              />
              <Input type="password" placeholder="Password" />
            </div>
          </Section>

          <Section title="Textarea">
            <div className="space-y-4 max-w-sm">
              <Textarea
                placeholder="Default textarea"
                value={textareaValue}
                onChange={(e) => setTextareaValue(e.target.value)}
              />
              <Textarea
                placeholder="With character count"
                showCount
                maxLength={100}
                value={textareaValue}
                onChange={(e) => setTextareaValue(e.target.value)}
              />
              <Textarea placeholder="With error" error />
            </div>
          </Section>

          <Section title="Badge">
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="error">Error</Badge>
              <Badge variant="info">Info</Badge>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <Badge dot>With dot</Badge>
              <Badge variant="success" dot>
                Online
              </Badge>
              <Badge size="sm">Small</Badge>
            </div>
          </Section>

          <Section title="Avatar">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar size="xs" fallback="John Doe" />
              <Avatar size="sm" fallback="Jane Smith" />
              <Avatar size="md" fallback="Bob Wilson" />
              <Avatar size="lg" fallback="Alice Brown" />
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-4">
              <Avatar fallback="Online" presence="online" />
              <Avatar fallback="Offline" presence="offline" />
              <Avatar fallback="Busy" presence="busy" />
            </div>
            <div className="mt-4">
              <AvatarGroup max={3}>
                <Avatar fallback="A" />
                <Avatar fallback="B" />
                <Avatar fallback="C" />
                <Avatar fallback="D" />
                <Avatar fallback="E" />
              </AvatarGroup>
            </div>
          </Section>

          <Section title="Card">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <Heading as="h3" size="base">
                    Card Title
                  </Heading>
                  <Copy size="sm" muted>
                    Card description
                  </Copy>
                </CardHeader>
                <CardContent>
                  <Copy>Card content goes here.</Copy>
                </CardContent>
                <CardFooter>
                  <Button size="sm">Action</Button>
                </CardFooter>
              </Card>
              <Card shadow>
                <CardHeader>
                  <Heading as="h3" size="base">
                    With Shadow
                  </Heading>
                </CardHeader>
                <CardContent>
                  <Copy>This card has a shadow.</Copy>
                </CardContent>
              </Card>
            </div>
          </Section>

          <Section title="Skeleton">
            <div className="space-y-4 max-w-sm">
              <Skeleton variant="text" />
              <Skeleton variant="text" width="75%" />
              <Skeleton variant="text" width="50%" />
              <div className="flex gap-4 items-center">
                <Skeleton variant="circle" width={40} height={40} />
                <div className="flex-1 space-y-2">
                  <Skeleton variant="text" />
                  <Skeleton variant="text" width="60%" />
                </div>
              </div>
              <Skeleton variant="rectangle" height={100} />
            </div>
          </Section>

          <Section title="Spinner">
            <div className="flex items-center gap-4">
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" />
            </div>
          </Section>

          <Section title="Tooltip">
            <div className="flex gap-4">
              <Tooltip content="Top tooltip" position="top">
                <Button variant="secondary">Top</Button>
              </Tooltip>
              <Tooltip content="Right tooltip" position="right">
                <Button variant="secondary">Right</Button>
              </Tooltip>
              <Tooltip content="Bottom tooltip" position="bottom">
                <Button variant="secondary">Bottom</Button>
              </Tooltip>
              <Tooltip content="Left tooltip" position="left">
                <Button variant="secondary">Left</Button>
              </Tooltip>
            </div>
          </Section>

          <Section title="Modal">
            <Button onClick={() => setModalOpen(true)}>Open Modal</Button>
            <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
              <ModalHeader>
                <Heading as="h3" size="lg">
                  Modal Title
                </Heading>
                <Copy size="sm" muted>
                  Modal description
                </Copy>
              </ModalHeader>
              <ModalContent>
                <Copy>This is the modal content. Press Escape or click outside to close.</Copy>
              </ModalContent>
              <ModalFooter>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setModalOpen(false)}>Confirm</Button>
              </ModalFooter>
            </Modal>
          </Section>

          <Section title="Dropdown">
            <Dropdown>
              <DropdownTrigger asChild>
                <Button variant="secondary">
                  Options
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="square" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Button>
              </DropdownTrigger>
              <DropdownMenu>
                <DropdownItem>Edit</DropdownItem>
                <DropdownItem>Duplicate</DropdownItem>
                <DropdownSeparator />
                <DropdownItem>Delete</DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </Section>

          <Section title="Select">
            <div className="max-w-sm space-y-4">
              <Select
                options={[
                  { value: "1", label: "Option 1" },
                  { value: "2", label: "Option 2" },
                  { value: "3", label: "Option 3" },
                ]}
                value={selectValue}
                onChange={setSelectValue}
                placeholder="Select an option"
              />
              <Select
                options={[
                  { value: "react", label: "React" },
                  { value: "vue", label: "Vue" },
                  { value: "angular", label: "Angular" },
                  { value: "svelte", label: "Svelte" },
                ]}
                searchable
                placeholder="Search frameworks..."
              />
            </div>
          </Section>

          <Section title="Tabs">
            <Tabs defaultValue="tab1">
              <TabsList>
                <TabsTrigger value="tab1">Account</TabsTrigger>
                <TabsTrigger value="tab2">Settings</TabsTrigger>
                <TabsTrigger value="tab3">Notifications</TabsTrigger>
              </TabsList>
              <TabsContent value="tab1">
                <Copy>Account settings and preferences.</Copy>
              </TabsContent>
              <TabsContent value="tab2">
                <Copy>General application settings.</Copy>
              </TabsContent>
              <TabsContent value="tab3">
                <Copy>Notification preferences.</Copy>
              </TabsContent>
            </Tabs>
          </Section>

          <Section title="Toast">
            <ToastDemo />
          </Section>

          <Section title="Empty State">
            <EmptyState
              icon={
                <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="square"
                    strokeWidth={1.5}
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                  />
                </svg>
              }
              title="No messages"
              description="You don't have any messages yet. Start a conversation to see them here."
              action={<Button>Start conversation</Button>}
            />
          </Section>
        </div>
      </div>
    </ToastProvider>
  );
}
